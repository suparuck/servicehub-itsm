import type { ImprovementStatus, Prisma } from '@prisma/client';
import { th } from '@/i18n/th';
import { logAudit } from './audit';
import { db } from './db';
import { parseDocNo } from './docno';
import { DomainError } from './errors';
import { canMoveImpStatus, isOverdue, isStep, needsReason, validateComplete, validateImprovement, validateStepMove, type ImpFormInput } from './improvement';
import { checkImprovementAlert } from './mail/notify';
import { assertCan, type Role } from './permissions';

export class ImprovementError extends DomainError {}
type Actor = { id: string; role: Role };

const STATUSES: ImprovementStatus[] = ['OPEN', 'ON_HOLD', 'DONE', 'CANCELLED'];
const include = { owner: { select: { id: true, name: true } }, problem: { select: { seq: true, title: true } }, service: { select: { code: true, name: true } } } satisfies Prisma.ImprovementItemInclude;

// ── ค้นหา/ดู ────────────────────────────────────────────────

export interface ImpFilters {
  q?: string;
  status?: string;
  step?: string;
  mine?: string; // userId
  overdue?: string;
}

export async function listImprovements(f: ImpFilters = {}, now = new Date()) {
  const and: Prisma.ImprovementItemWhereInput[] = [];
  const q = f.q?.trim();
  if (q) {
    const seq = parseDocNo('IMP', q) ?? (/^\d+$/.test(q) ? Number(q) : null);
    and.push({ OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { owner: { name: { contains: q, mode: 'insensitive' } } }, ...(seq !== null ? [{ seq }] : [])] });
  }
  if (f.status && STATUSES.includes(f.status as ImprovementStatus)) and.push({ status: f.status as ImprovementStatus });
  if (f.step && isStep(Number(f.step))) and.push({ step: Number(f.step) });
  if (f.mine) and.push({ ownerId: f.mine });
  const rows = await db.improvementItem.findMany({ where: and.length ? { AND: and } : {}, include, orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { seq: 'asc' }] });
  const withFlag = rows.map((r) => ({ ...r, overdue: isOverdue(r, now) }));
  return f.overdue === '1' ? withFlag.filter((r) => r.overdue) : withFlag;
}

export async function improvementSummary(now = new Date()) {
  const all = await db.improvementItem.findMany({ select: { status: true, targetDate: true, step: true } });
  return {
    open: all.filter((i) => i.status === 'OPEN').length,
    onHold: all.filter((i) => i.status === 'ON_HOLD').length,
    done: all.filter((i) => i.status === 'DONE').length,
    overdue: all.filter((i) => isOverdue(i, now)).length,
    byStep: Array.from({ length: 7 }, (_, k) => all.filter((i) => i.status === 'OPEN' && i.step === k + 1).length),
  };
}

export async function getImprovement(docNo: string) {
  const seq = parseDocNo('IMP', docNo);
  if (seq === null) return null;
  return db.improvementItem.findUnique({ where: { seq }, include });
}

export async function formOptions() {
  const [owners, problems, services] = await Promise.all([
    db.user.findMany({ where: { active: true, role: { not: 'END_USER' } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.problem.findMany({ orderBy: { seq: 'desc' }, take: 100, select: { id: true, seq: true, title: true } }),
    db.service.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, code: true, name: true } }),
  ]);
  return { owners, problems, services };
}

// ── เปลี่ยนแปลง ─────────────────────────────────────────────

/** ตรวจว่าเจ้าของเป็นเจ้าหน้าที่ที่ใช้งานอยู่ และ Problem/บริการที่ผูกมีอยู่จริง */
async function checkRefs(c: { ownerId: string | null; problemId: string | null; serviceId: string | null }) {
  if (c.ownerId && !(await db.user.findFirst({ where: { id: c.ownerId, active: true, role: { not: 'END_USER' } }, select: { id: true } }))) throw new ImprovementError('ไม่พบเจ้าของที่เลือก (ต้องเป็นเจ้าหน้าที่ที่ยังใช้งานอยู่)');
  if (c.problemId && !(await db.problem.findUnique({ where: { id: c.problemId }, select: { id: true } }))) throw new ImprovementError('ไม่พบ Problem ที่เลือก');
  if (c.serviceId && !(await db.service.findUnique({ where: { id: c.serviceId }, select: { id: true } }))) throw new ImprovementError('ไม่พบบริการที่เลือก');
}

export async function createImprovement(actor: Actor, input: ImpFormInput) {
  assertCan(actor.role, 'improvement.manage');
  const { errors, clean } = validateImprovement(input);
  if (errors.length) throw new ImprovementError(errors.join(' · '));
  await checkRefs(clean);
  const max = await db.improvementItem.aggregate({ _max: { sortOrder: true } });
  const it = await db.improvementItem.create({ data: { ...clean, step: 1, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  await logAudit('IMPROVEMENT', it.id, actor.id, `เสนอรายการปรับปรุง “${it.title}”`);
  await checkImprovementAlert(it.id);
  return it;
}

async function load(seq: number) {
  const it = await db.improvementItem.findUnique({ where: { seq }, include: { owner: { select: { name: true } } } });
  if (!it) throw new ImprovementError('ไม่พบรายการปรับปรุง');
  return it;
}

export async function updateImprovement(actor: Actor, seq: number, input: ImpFormInput) {
  assertCan(actor.role, 'improvement.manage');
  const cur = await load(seq);
  if (cur.status === 'DONE' || cur.status === 'CANCELLED') throw new ImprovementError('รายการที่ปิดหรือยกเลิกแล้วแก้ไขไม่ได้ (เปิดใหม่ก่อนถ้าเป็นรายการที่เสร็จแล้ว)');
  const { errors, clean } = validateImprovement(input);
  if (errors.length) throw new ImprovementError(errors.join(' · '));
  await checkRefs(clean);
  const notes: string[] = [];
  const diff = (label: string, a: unknown, b: unknown) => {
    const na = a instanceof Date ? a.getTime() : a ?? null;
    const nb = b instanceof Date ? b.getTime() : b ?? null;
    if (na !== nb) notes.push(label);
  };
  diff('หัวข้อ', cur.title, clean.title);
  diff('วิสัยทัศน์/เหตุผล', cur.description, clean.description);
  diff('สถานะปัจจุบัน (ค่าฐาน)', cur.baseline, clean.baseline);
  diff('เป้าหมาย', cur.goal, clean.goal);
  diff('ผลที่ได้', cur.result, clean.result);
  diff('ระดับประโยชน์', cur.benefit, clean.benefit);
  diff('เจ้าของ', cur.ownerId, clean.ownerId);
  diff('วันเป้าหมาย', cur.targetDate, clean.targetDate);
  diff('Problem ที่ผูก', cur.problemId, clean.problemId);
  diff('บริการที่ผูก', cur.serviceId, clean.serviceId);
  if (!notes.length) return;
  await db.improvementItem.update({ where: { seq }, data: clean });
  await logAudit('IMPROVEMENT', cur.id, actor.id, `แก้ไข: ${notes.join(' · ')}`);
  await checkImprovementAlert(cur.id);
}

/** เดินหน้า/ย้อนขั้นตามโมเดล 7 ขั้น (ตรวจประตูข้อมูลที่ต้องมีก่อนไปขั้นถัดไปจากค่าในฐานข้อมูล ไม่ใช่ค่าจากฟอร์ม) */
export async function moveStep(actor: Actor, seq: number, to: number, note?: string) {
  assertCan(actor.role, 'improvement.manage');
  const cur = await load(seq);
  if (cur.status !== 'OPEN') throw new ImprovementError('เปลี่ยนขั้นได้เฉพาะรายการที่กำลังดำเนินการ');
  const err = validateStepMove(cur.step, to, cur);
  if (err) throw new ImprovementError(err);
  await db.improvementItem.update({ where: { seq }, data: { step: to } });
  const names = th.dashboard.improveSteps;
  await logAudit('IMPROVEMENT', cur.id, actor.id, `ขั้นที่ ${cur.step} (${names[cur.step - 1]}) → ขั้นที่ ${to} (${names[to - 1]})${note?.trim() ? `\n${note.trim().slice(0, 300)}` : ''}`);
}

export async function changeImprovementStatus(actor: Actor, seq: number, to: string, reason?: string) {
  assertCan(actor.role, 'improvement.manage');
  const cur = await load(seq);
  if (!STATUSES.includes(to as ImprovementStatus)) throw new ImprovementError('สถานะไม่ถูกต้อง');
  const next = to as ImprovementStatus;
  if (!canMoveImpStatus(cur.status, next)) throw new ImprovementError(`เปลี่ยนจาก ${th.improvement.status[cur.status]} เป็น ${th.improvement.status[next]} ไม่ได้`);
  if (needsReason(next) && !reason?.trim()) throw new ImprovementError('ต้องระบุเหตุผล');
  const data: Prisma.ImprovementItemUpdateInput = { status: next };
  if (next === 'DONE') {
    const err = validateComplete(cur.step, cur.status, cur);
    if (err) throw new ImprovementError(err);
    data.step = 7; // ปิดแล้วเข้าสู่ขั้น "รักษาแรงส่ง"
    data.completedAt = new Date();
  } else if (cur.status === 'DONE' && next === 'OPEN') {
    data.step = 6; // เปิดใหม่: กลับไปตรวจว่าไปถึงเป้าหรือยัง
    data.completedAt = null;
  }
  await db.improvementItem.update({ where: { seq }, data });
  await logAudit('IMPROVEMENT', cur.id, actor.id, `เปลี่ยนสถานะ: ${th.improvement.status[cur.status]} → ${th.improvement.status[next]}${reason?.trim() ? `\n${reason.trim().slice(0, 300)}` : ''}`);
}
