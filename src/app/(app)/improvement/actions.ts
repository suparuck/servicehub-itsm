'use server';

import { runAction } from '@/lib/actionUtils';
import { getCurrentUser } from '@/lib/currentUser';
import { formatDocNo } from '@/lib/docno';
import { changeImprovementStatus, createImprovement, moveStep, updateImprovement } from '@/lib/improvementService';
import type { Role } from '@/lib/permissions';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

// ทุก action ผ่าน getCurrentUser + assertCan ใน service — server action ถูกเรียกได้จากทุกที่ ห้ามเชื่อแค่การซ่อนปุ่ม
async function actor() {
  const u = await getCurrentUser();
  return { id: u.id, role: u.role as Role };
}
const back = (seq: number) => `/improvement/${formatDocNo('IMP', seq)}`;

const fields = (fd: FormData) => ({
  title: str(fd, 'title'), description: str(fd, 'description'), baseline: str(fd, 'baseline'), goal: str(fd, 'goal'), result: str(fd, 'result'),
  benefit: str(fd, 'benefit'), ownerId: str(fd, 'ownerId'), targetDate: str(fd, 'targetDate'), problemId: str(fd, 'problemId'), serviceId: str(fd, 'serviceId'),
});

export async function createImprovementAction(fd: FormData) {
  await runAction('/improvement/new', async () => {
    const it = await createImprovement(await actor(), fields(fd));
    return back(it.seq);
  });
}

export async function updateImprovementAction(seq: number, fd: FormData) {
  await runAction(back(seq), async () => { await updateImprovement(await actor(), seq, fields(fd)); });
}

export async function moveStepAction(seq: number, fd: FormData) {
  await runAction(back(seq), async () => { await moveStep(await actor(), seq, Number(fd.get('to')), str(fd, 'note')); });
}

export async function changeStatusAction(seq: number, fd: FormData) {
  await runAction(back(seq), async () => { await changeImprovementStatus(await actor(), seq, str(fd, 'to'), str(fd, 'reason')); });
}
