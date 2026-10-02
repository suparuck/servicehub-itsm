'use server';

import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { formatDocNo } from '@/lib/docno';
import { DomainError } from '@/lib/errors';
import { runAction } from '@/lib/actionUtils';
import type { Role } from '@/lib/permissions';
import { addTask, cancelRequest, decideRequest, deliverRequest, toggleTask } from '@/lib/requestService';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function actor() {
  const u = await getCurrentUser();
  if (!u) throw new DomainError('ไม่พบผู้ใช้');
  return { id: u.id, role: u.role as Role, name: u.name };
}
async function docOf(id: string) {
  const r = await db.serviceRequest.findUnique({ where: { id }, select: { seq: true } });
  if (!r) throw new DomainError('ไม่พบคำขอ');
  return `/requests/${formatDocNo('REQ', r.seq)}`;
}

export async function decideRequestAction(id: string, decision: 'APPROVED' | 'REJECTED', fd: FormData) {
  await runAction(await docOf(id), async () => { await decideRequest(await actor(), id, decision, str(fd, 'comment')); });
}
export async function addTaskAction(id: string, fd: FormData) {
  await runAction(await docOf(id), async () => { await addTask(await actor(), id, str(fd, 'title')); });
}
export async function toggleTaskAction(id: string, taskId: string) {
  await runAction(await docOf(id), async () => { await toggleTask(await actor(), id, taskId); });
}
export async function deliverAction(id: string) {
  await runAction(await docOf(id), async () => { await deliverRequest(await actor(), id); });
}
export async function cancelRequestAction(id: string, fd: FormData) {
  await runAction(await docOf(id), async () => { await cancelRequest(await actor(), id, str(fd, 'reason')); });
}
