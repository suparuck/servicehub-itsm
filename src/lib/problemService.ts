import { db } from './db';
import { logAudit } from './audit';
import { assertCan, type Role } from './permissions';
import { parseDocNo, formatDocNo } from './docno';
import { nextPhases, parseTargetDate, validateTransition, type ProblemPhase } from './problem';
import { th } from '@/i18n/th';
import { thDateShort } from './datetime';
import { DomainError } from './errors';

export class ProblemError extends DomainError {}
type Actor = { id: string; role: Role };
const OPEN_CHANGE = { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] as ('COMPLETED' | 'FAILED' | 'CANCELLED')[] };

async function load(id: string) {
  const p = await db.problem.findUnique({ where: { id } });
  if (!p) throw new ProblemError('ไม่พบ Problem');
  return p;
}

export async function createProblem(actor: Actor, input: { title: string; description?: string; incidentIds?: string[] }) {
  assertCan(actor.role, 'problem.manage');
  const title = input.title.trim();
  if (!title) throw new ProblemError('กรุณาระบุหัวข้อ Problem');
  if (title.length > 200) throw new ProblemError('หัวข้อยาวเกิน 200 ตัวอักษร');
  const p = await db.problem.create({
    data: { title, description: input.description?.trim() || null, phase: 'IDENTIFICATION', incidents: input.incidentIds?.length ? { connect: input.incidentIds.map((id) => ({ id })) } : undefined },
  });
  await logAudit('PROBLEM', p.id, actor.id, 'สร้าง Problem');
  return p;
}

export async function updateProblem(actor: Actor, id: string, input: { title: string; description?: string; rootCause?: string; workaround?: string; targetDate?: string }) {
  assertCan(actor.role, 'problem.manage');
  const cur = await load(id);
  const title = input.title.trim();
  if (!title) throw new ProblemError('กรุณาระบุหัวข้อ Problem');
  const notes: string[] = [];
  const norm = (v?: string | null) => v?.trim() || null;
  if (norm(input.rootCause) !== cur.rootCause) notes.push(`อัปเดตสาเหตุที่แท้จริง (Root cause): ${norm(input.rootCause) ?? '—'}`);
  if (norm(input.workaround) !== cur.workaround) notes.push(`อัปเดตวิธีแก้ชั่วคราว (Workaround): ${norm(input.workaround) ?? '—'}`);
  if (title !== cur.title) notes.push(`เปลี่ยนหัวข้อเป็น “${title}”`);
  // วันที่กำหนดแก้ไข/ทบทวน (วันที่ตามเวลาไทย) — ว่าง = ล้างค่า; ไม่ส่งมา = ไม่แตะ
  const parsed = input.targetDate === undefined ? undefined : parseTargetDate(input.targetDate);
  if (parsed && 'error' in parsed) throw new ProblemError(parsed.error);
  const target = parsed === undefined ? undefined : parsed.date;
  if (target !== undefined && (target?.getTime() ?? null) !== (cur.targetDate?.getTime() ?? null)) {
    notes.push(`กำหนดแก้ไข/ทบทวน: ${target ? thDateShort(target) : '— (ล้างค่า)'}`);
  }
  await db.problem.update({ where: { id }, data: { title, description: norm(input.description), rootCause: norm(input.rootCause), workaround: norm(input.workaround), ...(target !== undefined ? { targetDate: target } : {}) } });
  if (notes.length) await logAudit('PROBLEM', id, actor.id, notes.join('\n'));
}

export async function transitionProblem(actor: Actor, id: string, to: ProblemPhase, note?: string) {
  assertCan(actor.role, 'problem.manage');
  const cur = await load(id);
  const openChanges = await db.change.count({ where: { problemId: id, status: OPEN_CHANGE } });
  const err = validateTransition(cur.phase, to, { rootCause: cur.rootCause, workaround: cur.workaround, openChanges });
  if (err) throw new ProblemError(err);
  await db.problem.update({
    where: { id },
    data: { phase: to, phaseLabel: null, resolvedAt: to === 'RESOLVED' ? new Date() : to === 'CONTROL' && cur.phase === 'RESOLVED' ? null : undefined },
  });
  await logAudit('PROBLEM', id, actor.id, `เปลี่ยนระยะ: ${th.problemPhase[cur.phase]} → ${th.problemPhase[to]}${note?.trim() ? `\n${note.trim()}` : ''}`);
}

export async function linkIncident(actor: Actor, id: string, docNo: string) {
  assertCan(actor.role, 'problem.manage');
  await load(id);
  const seq = parseDocNo('INC', docNo) ?? (/^\d+$/.test(docNo.trim()) ? Number(docNo) : null);
  if (seq === null) throw new ProblemError('รูปแบบเลขที่ Incident ไม่ถูกต้อง (เช่น INC-24817)');
  const inc = await db.incident.findUnique({ where: { seq } });
  if (!inc) throw new ProblemError('ไม่พบ Incident นี้');
  if (inc.problemId === id) throw new ProblemError('Incident นี้ผูกกับ Problem นี้อยู่แล้ว');
  if (inc.problemId) throw new ProblemError('Incident นี้ผูกกับ Problem อื่นอยู่แล้ว');
  await db.incident.update({ where: { id: inc.id }, data: { problemId: id } });
  await logAudit('PROBLEM', id, actor.id, `ผูก ${formatDocNo('INC', inc.seq)} · ${inc.title}`);
}

export async function unlinkIncident(actor: Actor, id: string, incidentId: string) {
  assertCan(actor.role, 'problem.manage');
  const inc = await db.incident.findFirst({ where: { id: incidentId, problemId: id } });
  if (!inc) throw new ProblemError('ไม่พบ Incident ที่ผูกอยู่');
  await db.incident.update({ where: { id: incidentId }, data: { problemId: null } });
  await logAudit('PROBLEM', id, actor.id, `ยกเลิกการผูก ${formatDocNo('INC', inc.seq)}`);
}

/** ร่างบทความ KB จาก Workaround/Root cause เพื่อเผยแพร่ภายหลัง (ต้องมีสิทธิ์ kb.manage ผ่านบทบาท problem.manage ที่รวมอยู่แล้ว) */
export async function createKbFromProblem(actor: Actor, id: string) {
  assertCan(actor.role, 'problem.manage');
  const p = await load(id);
  if (!p.workaround?.trim()) throw new ProblemError('ต้องระบุวิธีแก้ชั่วคราวก่อนสร้างบทความ');
  const body = `อาการ: ${p.title}\n\nวิธีแก้ชั่วคราว:\n${p.workaround}${p.rootCause ? `\n\nสาเหตุ:\n${p.rootCause}` : ''}`;
  const kb = await db.knowledgeArticle.create({ data: { title: p.title, body, status: 'DRAFT', problemId: id } });
  await logAudit('PROBLEM', id, actor.id, `สร้างร่างบทความ ${formatDocNo('KB', kb.seq)}`);
  await logAudit('KB', kb.id, actor.id, `สร้างจาก ${formatDocNo('PRB', p.seq)}`);
  return kb;
}

export async function createChangeFromProblem(actor: Actor, id: string) {
  assertCan(actor.role, 'change.create');
  const p = await load(id);
  const start = new Date(Date.now() + 3 * 86_400_000);
  start.setUTCHours(18, 0, 0, 0); // 01:00 เวลาไทย
  const c = await db.change.create({
    data: { title: `แก้ไขถาวร: ${p.title}`, type: 'NORMAL', risk: 'MED', status: 'DRAFT', windowStart: start, windowEnd: new Date(start.getTime() + 2 * 3_600_000), problemId: id, description: p.rootCause ? `แก้ที่ต้นเหตุ: ${p.rootCause}` : null },
  });
  await logAudit('PROBLEM', id, actor.id, `สร้าง ${formatDocNo('CHG', c.seq)} เพื่อแก้ไขถาวร`);
  await logAudit('CHANGE', c.id, actor.id, `สร้างจาก ${formatDocNo('PRB', p.seq)}`);
  return c;
}

export { nextPhases };
