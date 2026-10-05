'use server';

import { runAction } from '@/lib/actionUtils';
import { getCurrentUser } from '@/lib/currentUser';
import { formatDocNo } from '@/lib/docno';
import type { Role } from '@/lib/permissions';
import { addChangeToRelease, changeReleaseStatus, createRelease, removeChangeFromRelease, saveReview, updateRelease } from '@/lib/releaseService';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

// ทุก action ผ่าน getCurrentUser + assertCan ใน service — server action ถูกเรียกได้จากทุกที่ ห้ามเชื่อแค่การซ่อนปุ่ม
async function actor() {
  const u = await getCurrentUser();
  return { id: u.id, role: u.role as Role };
}
const back = (seq: number) => `/releases/${formatDocNo('REL', seq)}`;

const fields = (fd: FormData) => ({
  name: str(fd, 'name'), version: str(fd, 'version'), description: str(fd, 'description'), ownerId: str(fd, 'ownerId'), serviceId: str(fd, 'serviceId'),
  windowStart: str(fd, 'windowStart'), windowEnd: str(fd, 'windowEnd'), deployPlan: str(fd, 'deployPlan'), rollbackPlan: str(fd, 'rollbackPlan'),
});

export async function createReleaseAction(fd: FormData) {
  await runAction('/releases/new', async () => back((await createRelease(await actor(), fields(fd))).seq));
}

export async function updateReleaseAction(seq: number, fd: FormData) {
  await runAction(back(seq), async () => { await updateRelease(await actor(), seq, fields(fd)); });
}

export async function addChangeAction(seq: number, fd: FormData) {
  await runAction(back(seq), async () => { await addChangeToRelease(await actor(), seq, str(fd, 'change')); });
}

export async function removeChangeAction(seq: number, changeId: string) {
  await runAction(back(seq), async () => { await removeChangeFromRelease(await actor(), seq, changeId); });
}

export async function moveStatusAction(seq: number, fd: FormData) {
  await runAction(back(seq), async () => { await changeReleaseStatus(await actor(), seq, str(fd, 'to'), str(fd, 'reason')); });
}

export async function reviewAction(seq: number, fd: FormData) {
  await runAction(back(seq), async () => { await saveReview(await actor(), seq, str(fd, 'review')); });
}
