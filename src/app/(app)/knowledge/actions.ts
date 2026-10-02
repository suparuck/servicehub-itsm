'use server';

import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { formatDocNo } from '@/lib/docno';
import { DomainError } from '@/lib/errors';
import { runAction } from '@/lib/actionUtils';
import { createArticle, setStatus, updateArticle } from '@/lib/kbService';
import type { Role } from '@/lib/permissions';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function actor() {
  const u = await getCurrentUser();
  if (!u) throw new DomainError('ไม่พบผู้ใช้');
  return { id: u.id, role: u.role as Role };
}
async function docOf(id: string) {
  const a = await db.knowledgeArticle.findUnique({ where: { id }, select: { seq: true } });
  if (!a) throw new DomainError('ไม่พบบทความ');
  return `/knowledge/${formatDocNo('KB', a.seq)}`;
}

export async function createArticleAction(fd: FormData) {
  await runAction('/knowledge/new', async () => {
    const a = await createArticle(await actor(), { title: str(fd, 'title'), body: str(fd, 'body'), problemId: str(fd, 'problemId') || null });
    return `/knowledge/${formatDocNo('KB', a.seq)}`;
  });
}

export async function updateArticleAction(id: string, fd: FormData) {
  await runAction(await docOf(id), async () => {
    await updateArticle(await actor(), id, { title: str(fd, 'title'), body: str(fd, 'body'), problemId: str(fd, 'problemId') || null });
  });
}

export async function publishAction(id: string) {
  await runAction(await docOf(id), async () => { await setStatus(await actor(), id, 'PUBLISHED'); });
}
export async function unpublishAction(id: string) {
  await runAction(await docOf(id), async () => { await setStatus(await actor(), id, 'DRAFT'); });
}
