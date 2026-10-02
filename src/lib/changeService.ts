import type { ChangeStatus as DbStatus, ChangeType as DbType, RiskLevel } from '@prisma/client';
import { db } from './db';
import { logAudit } from './audit';
import { boardFor, canMove, evaluateApprovals, findConflicts, isClosed, validateSubmit, type ChangeStatus, type Decision } from './change';
import { DomainError } from './errors';
import { formatDocNo } from './docno';
import { assertCan, type Role } from './permissions';
import { th } from '@/i18n/th';

export class ChangeError extends DomainError {}
export type Actor = { id: string; role: Role };

export interface ChangeInput {
  title: string;
  type: DbType;
  risk: RiskLevel;
  windowStart: Date | null;
  windowEnd: Date | null;
  serviceId?: string | null;
  problemId?: string | null;
  description?: string;
  implementationPlan?: string;
  backoutPlan?: string;
  ciIds: string[];
}

const nn = (v?: string) => v?.trim() || null;
const label = (s: ChangeStatus) => th.changeStatus[s];

async function load(id: string) {
  const c = await db.change.findUnique({ where: { id }, include: { cis: true, approvals: true } });
  if (!c) throw new ChangeError('ไม่พบ Change');
  return c;
}

function checkInput(i: ChangeInput) {
  if (!i.title.trim()) throw new ChangeError('กรุณาระบุหัวข้อ Change');
  if (i.title.length > 200) throw new ChangeError('หัวข้อยาวเกิน 200 ตัวอักษร');
  if (!i.windowStart) throw new ChangeError('กรุณาระบุเวลาเริ่มของช่วงดำเนินการ');
  if (i.windowEnd && i.windowEnd <= i.windowStart) throw new ChangeError('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
}

export async function createChange(actor: Actor, input: ChangeInput) {
  assertCan(actor.role, 'change.create');
  checkInput(input);
  const c = await db.change.create({
    data: {
      title: input.title.trim(), type: input.type, risk: input.risk, status: 'DRAFT', windowStart: input.windowStart!, windowEnd: input.windowEnd,
      serviceId: input.serviceId || null, problemId: input.problemId || null, description: nn(input.description),
      implementationPlan: nn(input.implementationPlan), backoutPlan: nn(input.backoutPlan),
      cis: { create: input.ciIds.map((ciId) => ({ ciId })) },
    },
  });
  await logAudit('CHANGE', c.id, actor.id, `สร้าง Change (${th.changeType[c.type]})`);
  return c;
}

export async function updateChange(actor: Actor, id: string, input: ChangeInput) {
  assertCan(actor.role, 'change.create');
  checkInput(input);
  const cur = await load(id);
  if (cur.status !== 'DRAFT') throw new ChangeError('แก้ไขได้เฉพาะ Change ที่เป็นร่างเท่านั้น');
  await db.change.update({
    where: { id },
    data: {
      title: input.title.trim(), type: input.type, risk: input.risk, windowStart: input.windowStart!, windowEnd: input.windowEnd,
      serviceId: input.serviceId || null, problemId: input.problemId || null, description: nn(input.description),
      implementationPlan: nn(input.implementationPlan), backoutPlan: nn(input.backoutPlan),
      cis: { deleteMany: {}, create: input.ciIds.map((ciId) => ({ ciId })) },
    },
  });
  await logAudit('CHANGE', id, actor.id, 'แก้ไขรายละเอียด Change');
}

/** ส่งอนุมัติ: Standard อนุมัติล่วงหน้าอัตโนมัติ · Normal/Emergency สร้างรายการให้สมาชิก CAB พิจารณา */
export async function submitChange(actor: Actor, id: string) {
  assertCan(actor.role, 'change.create');
  const c = await load(id);
  if (!canMove(c.status, 'AWAITING_APPROVAL')) throw new ChangeError('Change นี้ส่งอนุมัติไม่ได้ในสถานะปัจจุบัน');
  const errs = validateSubmit(c);
  if (errs.length) throw new ChangeError(`ส่งอนุมัติไม่ได้: ${errs.join(' · ')}`);

  const board = boardFor(c.type);
  if (!board) {
    await db.change.update({ where: { id }, data: { status: 'APPROVED', cabApproval: null } });
    await logAudit('CHANGE', id, actor.id, 'Standard Change — อนุมัติล่วงหน้าตามนโยบาย (ไม่ต้องผ่าน CAB)');
    return;
  }
  const members = await db.user.findMany({ where: { role: 'CAB_MEMBER' } });
  if (!members.length) throw new ChangeError('ยังไม่มีสมาชิก CAB ในระบบ');
  await db.$transaction(async (tx) => {
    await tx.changeApproval.deleteMany({ where: { changeId: id } });
    await tx.changeApproval.createMany({ data: members.map((m) => ({ changeId: id, board, approverId: m.id })) });
    await tx.change.update({ where: { id }, data: { status: 'AWAITING_APPROVAL', cabApproval: board } });
    await logAudit('CHANGE', id, actor.id, `ส่งให้ ${board} พิจารณา (${members.length} คน)`, tx);
  });
}

export async function decideApproval(actor: Actor, id: string, decision: Exclude<Decision, 'PENDING'>, comment?: string) {
  assertCan(actor.role, 'change.approve');
  const c = await load(id);
  if (c.status !== 'AWAITING_APPROVAL') throw new ChangeError('Change นี้ไม่ได้อยู่ในสถานะรออนุมัติ');
  const mine = c.approvals.find((a) => a.approverId === actor.id);
  if (!mine) throw new ChangeError('คุณไม่ได้อยู่ในรายชื่อผู้พิจารณา Change นี้');
  if (mine.decision !== 'PENDING') throw new ChangeError('คุณตัดสินใจไปแล้ว');
  if (decision === 'REJECTED' && !comment?.trim()) throw new ChangeError('ต้องระบุเหตุผลเมื่อไม่อนุมัติ');

  await db.$transaction(async (tx) => {
    await tx.changeApproval.update({ where: { id: mine.id }, data: { decision, comment: nn(comment), decidedAt: new Date() } });
    const all = await tx.changeApproval.findMany({ where: { changeId: id } });
    const result = evaluateApprovals(c.type, all.map((a) => a.decision));
    await logAudit('CHANGE', id, actor.id, `${c.cabApproval ?? 'CAB'} ${decision === 'APPROVED' ? 'อนุมัติ' : 'ไม่อนุมัติ'}${comment?.trim() ? `: ${comment.trim()}` : ''}`, tx);
    if (result === 'APPROVED') {
      await tx.change.update({ where: { id }, data: { status: 'APPROVED' } });
      await logAudit('CHANGE', id, null, 'ผ่านการอนุมัติ', tx);
    } else if (result === 'REJECTED') {
      await tx.change.update({ where: { id }, data: { status: 'DRAFT' } });
      await logAudit('CHANGE', id, null, 'ถูกปฏิเสธ — กลับเป็นร่างเพื่อแก้ไขและส่งใหม่', tx);
    }
  });
}

async function move(actor: Actor, id: string, to: ChangeStatus, action: 'change.manage', note: string, extra: Record<string, unknown> = {}, requireNote = false, noteText?: string) {
  assertCan(actor.role, action);
  const c = await load(id);
  if (!canMove(c.status, to)) throw new ChangeError(`เปลี่ยนสถานะจาก ${label(c.status)} เป็น ${label(to)} ไม่ได้`);
  if (requireNote && !noteText?.trim()) throw new ChangeError('กรุณาระบุบันทึก/ผลลัพธ์');
  await db.change.update({ where: { id }, data: { status: to as DbStatus, ...extra } });
  await logAudit('CHANGE', id, actor.id, `${note}${noteText?.trim() ? `\n${noteText.trim()}` : ''}`);
  return c;
}

export async function scheduleChange(actor: Actor, id: string) {
  assertCan(actor.role, 'change.manage');
  const c = await load(id);
  const conflicts = await conflictsFor(id);
  await move(actor, id, 'SCHEDULED', 'change.manage', `จัดตารางดำเนินการ${conflicts.length ? ` (มี Change ทับช่วงเวลา ${conflicts.length} รายการ)` : ''}`);
  return c;
}
export const startChange = (a: Actor, id: string) => move(a, id, 'IMPLEMENTING', 'change.manage', 'เริ่มดำเนินการ');
export const completeChange = (a: Actor, id: string, outcome: string) => move(a, id, 'COMPLETED', 'change.manage', 'ดำเนินการสำเร็จ', { outcome: outcome.trim(), completedAt: new Date() }, true, outcome);
export const failChange = (a: Actor, id: string, outcome: string) => move(a, id, 'FAILED', 'change.manage', 'ดำเนินการไม่สำเร็จ / ถอยกลับ', { outcome: outcome.trim(), completedAt: new Date() }, true, outcome);
export async function cancelChange(actor: Actor, id: string, reason: string) {
  const c = await load(id);
  if (!isClosed(c.status) && c.status === 'DRAFT') assertCan(actor.role, 'change.create');
  else assertCan(actor.role, 'change.manage');
  if (!canMove(c.status, 'CANCELLED')) throw new ChangeError('ยกเลิก Change นี้ไม่ได้ในสถานะปัจจุบัน');
  if (!reason.trim()) throw new ChangeError('กรุณาระบุเหตุผลที่ยกเลิก');
  await db.change.update({ where: { id }, data: { status: 'CANCELLED' } });
  await logAudit('CHANGE', id, actor.id, `ยกเลิก: ${reason.trim()}`);
}

/** Change อื่นที่ทับช่วงเวลาและแตะ CI/บริการเดียวกัน */
export async function conflictsFor(id: string) {
  const [target, others] = await Promise.all([
    db.change.findUnique({ where: { id }, include: { cis: true } }),
    db.change.findMany({ where: { id: { not: id }, status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] } }, include: { cis: true } }),
  ]);
  if (!target) return [];
  const map = (c: typeof target) => ({ id: c.id, windowStart: c.windowStart, windowEnd: c.windowEnd, serviceId: c.serviceId, ciIds: c.cis.map((x) => x.ciId), status: c.status as ChangeStatus });
  const found = findConflicts(map(target), others.map((o) => ({ ...map(o), seq: o.seq, title: o.title })));
  return found.map((f) => ({ id: f.change.id, no: formatDocNo('CHG', f.change.seq), title: f.change.title, reason: f.reason }));
}
