import { db } from './db';
import { logAudit } from './audit';
import { DomainError } from './errors';
import { assertCan, type Role } from './permissions';
import { approvalOutcome, deliverCheck, requestStage, type RequestStatus } from './request';
import { formatDocNo } from './docno';
import { notifyRequestStatus } from './mail/notify';

export class RequestError extends DomainError {}
type Actor = { id: string; role: Role; name: string };

async function load(id: string) {
  const r = await db.serviceRequest.findUnique({ where: { id }, include: { approvals: true, tasks: true } });
  if (!r) throw new RequestError('ไม่พบคำขอ');
  return r;
}

/** อนุมัติ/ไม่อนุมัติ ขั้นอนุมัติที่ยังรออยู่ขั้นแรก */
export async function decideRequest(actor: Actor, id: string, decision: 'APPROVED' | 'REJECTED', comment?: string) {
  assertCan(actor.role, 'request.approve');
  const r = await load(id);
  if (r.status !== 'PENDING_APPROVAL') throw new RequestError('คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ');
  const step = r.approvals.find((a) => !a.decision);
  if (!step) throw new RequestError('ไม่มีขั้นอนุมัติที่รออยู่');
  if (decision === 'REJECTED' && !comment?.trim()) throw new RequestError('ต้องระบุเหตุผลเมื่อไม่อนุมัติ');

  const outcome = await db.$transaction(async (tx) => {
    await tx.approvalStep.update({ where: { id: step.id }, data: { decision, decidedAt: new Date(), approver: `${step.approver} (${actor.name})` } });
    const all = await tx.approvalStep.findMany({ where: { requestId: id } });
    const outcome = approvalOutcome(all.map((a) => a.decision));
    await logAudit('REQUEST', id, actor.id, `${decision === 'APPROVED' ? 'อนุมัติ' : 'ไม่อนุมัติ'}${comment?.trim() ? `: ${comment.trim()}` : ''}`, tx);
    if (outcome === 'APPROVED') {
      await tx.serviceRequest.update({ where: { id }, data: { status: 'FULFILLING', stage: requestStage('FULFILLING'), nextNote: 'อนุมัติแล้ว · ทีม IT กำลังจัดเตรียม' } });
    } else if (outcome === 'REJECTED') {
      await tx.serviceRequest.update({ where: { id }, data: { status: 'REJECTED', stage: requestStage('REJECTED'), nextNote: `ไม่อนุมัติ: ${comment?.trim()}` } });
    }
    return outcome;
  });
  if (outcome === 'APPROVED' || outcome === 'REJECTED') await notifyRequestStatus(id, outcome, comment, actor.id);
}

export async function addTask(actor: Actor, id: string, title: string) {
  assertCan(actor.role, 'request.fulfil');
  const r = await load(id);
  if (r.status !== 'FULFILLING') throw new RequestError('เพิ่มงานจัดเตรียมได้เฉพาะคำขอที่อยู่ระหว่างจัดเตรียม');
  if (!title.trim()) throw new RequestError('กรุณาระบุชื่องาน');
  await db.fulfilmentTask.create({ data: { requestId: id, title: title.trim() } });
  await logAudit('REQUEST', id, actor.id, `เพิ่มงานจัดเตรียม: ${title.trim()}`);
}

export async function toggleTask(actor: Actor, id: string, taskId: string) {
  assertCan(actor.role, 'request.fulfil');
  const r = await load(id);
  if (r.status !== 'FULFILLING') throw new RequestError('แก้ไขงานได้เฉพาะคำขอที่อยู่ระหว่างจัดเตรียม');
  const t = r.tasks.find((x) => x.id === taskId);
  if (!t) throw new RequestError('ไม่พบงาน');
  await db.fulfilmentTask.update({ where: { id: taskId }, data: { done: !t.done } });
  await logAudit('REQUEST', id, actor.id, `${t.done ? 'เปิดงานอีกครั้ง' : 'งานเสร็จ'}: ${t.title}`);
}

export async function deliverRequest(actor: Actor, id: string) {
  assertCan(actor.role, 'request.fulfil');
  const r = await load(id);
  const err = deliverCheck(r.status as RequestStatus, r.tasks);
  if (err) throw new RequestError(err);
  await db.serviceRequest.update({ where: { id }, data: { status: 'DELIVERED', stage: requestStage('DELIVERED'), deliveredAt: new Date(), nextNote: 'ส่งมอบเรียบร้อย โปรดประเมินบริการ' } });
  await logAudit('REQUEST', id, actor.id, `ส่งมอบ ${formatDocNo('REQ', r.seq)}`);
  await notifyRequestStatus(id, 'DELIVERED', undefined, actor.id);
}

export async function cancelRequest(actor: Actor, id: string, reason: string) {
  assertCan(actor.role, 'request.fulfil');
  const r = await load(id);
  if (['DELIVERED', 'REJECTED', 'CANCELLED'].includes(r.status)) throw new RequestError('คำขอนี้จบแล้ว');
  if (!reason.trim()) throw new RequestError('กรุณาระบุเหตุผลที่ยกเลิก');
  await db.serviceRequest.update({ where: { id }, data: { status: 'CANCELLED', stage: 1, nextNote: `ยกเลิก: ${reason.trim()}` } });
  await logAudit('REQUEST', id, actor.id, `ยกเลิก: ${reason.trim()}`);
}
