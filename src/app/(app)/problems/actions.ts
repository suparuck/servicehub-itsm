'use server';

import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { formatDocNo } from '@/lib/docno';
import { DomainError } from '@/lib/errors';
import { runAction } from '@/lib/actionUtils';
import { PHASES, type ProblemPhase } from '@/lib/problem';
import { createChangeFromProblem, createKbFromProblem, createProblem, linkIncident, transitionProblem, unlinkIncident, updateProblem } from '@/lib/problemService';
import type { Role } from '@/lib/permissions';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function actor() {
  const u = await getCurrentUser();
  if (!u) throw new DomainError('ไม่พบผู้ใช้');
  return { id: u.id, role: u.role as Role };
}
async function docOf(id: string) {
  const p = await db.problem.findUnique({ where: { id }, select: { seq: true } });
  if (!p) throw new DomainError('ไม่พบ Problem');
  return `/problems/${formatDocNo('PRB', p.seq)}`;
}

export async function createProblemAction(fd: FormData) {
  await runAction('/problems/new', async () => {
    const p = await createProblem(await actor(), { title: str(fd, 'title'), description: str(fd, 'description') });
    return `/problems/${formatDocNo('PRB', p.seq)}`;
  });
}

export async function updateProblemAction(id: string, fd: FormData) {
  const back = await docOf(id);
  await runAction(back, async () => {
    await updateProblem(await actor(), id, { title: str(fd, 'title'), description: str(fd, 'description'), rootCause: str(fd, 'rootCause'), workaround: str(fd, 'workaround') });
  });
}

export async function transitionAction(id: string, fd: FormData) {
  const back = await docOf(id);
  await runAction(back, async () => {
    const to = str(fd, 'phase') as ProblemPhase;
    if (!PHASES.includes(to)) throw new DomainError('ระยะไม่ถูกต้อง');
    await transitionProblem(await actor(), id, to, str(fd, 'note'));
  });
}

export async function linkIncidentAction(id: string, fd: FormData) {
  const back = await docOf(id);
  await runAction(back, async () => { await linkIncident(await actor(), id, str(fd, 'incident')); });
}

export async function unlinkIncidentAction(id: string, incidentId: string) {
  const back = await docOf(id);
  await runAction(back, async () => { await unlinkIncident(await actor(), id, incidentId); });
}

export async function createKbAction(id: string) {
  const back = await docOf(id);
  await runAction(back, async () => { await createKbFromProblem(await actor(), id); });
}

export async function createChangeAction(id: string) {
  const back = await docOf(id);
  await runAction(back, async () => {
    const c = await createChangeFromProblem(await actor(), id);
    return `/changes/${formatDocNo('CHG', c.seq)}`;
  });
}
