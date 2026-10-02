'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ChangeType, RiskLevel } from '@prisma/client';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { fromBangkokInput } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { DomainError, isDomainError } from '@/lib/errors';
import { runAction } from '@/lib/actionUtils';
import type { Role } from '@/lib/permissions';
import { cancelChange, completeChange, createChange, decideApproval, failChange, scheduleChange, startChange, submitChange, updateChange, type ChangeInput } from '@/lib/changeService';

export type ChangeFormState = { error?: string; values?: Record<string, string | string[]> } | undefined;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const TYPES = ['STANDARD', 'NORMAL', 'EMERGENCY'];
const RISKS = ['HIGH', 'MED', 'LOW'];

async function actor() {
  const u = await getCurrentUser();
  if (!u) throw new DomainError('ไม่พบผู้ใช้');
  return { id: u.id, role: u.role as Role };
}
async function docOf(id: string) {
  const c = await db.change.findUnique({ where: { id }, select: { seq: true } });
  if (!c) throw new DomainError('ไม่พบ Change');
  return `/changes/${formatDocNo('CHG', c.seq)}`;
}
function valuesOf(fd: FormData) {
  const out: Record<string, string | string[]> = {};
  for (const k of new Set(fd.keys())) {
    if (k.startsWith('$ACTION')) continue;
    const all = fd.getAll(k).map(String);
    out[k] = k === 'ciIds' ? all : all[0];
  }
  return out;
}
function parse(fd: FormData): ChangeInput {
  if (!TYPES.includes(str(fd, 'type'))) throw new DomainError('กรุณาเลือกประเภท Change');
  if (!RISKS.includes(str(fd, 'risk'))) throw new DomainError('กรุณาเลือกระดับความเสี่ยง');
  return {
    title: str(fd, 'title'), type: str(fd, 'type') as ChangeType, risk: str(fd, 'risk') as RiskLevel,
    windowStart: fromBangkokInput(str(fd, 'windowStart')), windowEnd: fromBangkokInput(str(fd, 'windowEnd')),
    serviceId: str(fd, 'serviceId') || null, problemId: str(fd, 'problemId') || null, description: str(fd, 'description'),
    implementationPlan: str(fd, 'implementationPlan'), backoutPlan: str(fd, 'backoutPlan'), ciIds: fd.getAll('ciIds').map(String).filter(Boolean),
  };
}

export async function createChangeAction(_: ChangeFormState, fd: FormData): Promise<ChangeFormState> {
  let seq: number;
  try {
    seq = (await createChange(await actor(), parse(fd))).seq;
  } catch (e) {
    if (isDomainError(e)) return { error: e.message, values: valuesOf(fd) };
    throw e;
  }
  revalidatePath('/', 'layout');
  redirect(`/changes/${formatDocNo('CHG', seq)}`);
}

export async function updateChangeAction(id: string, _: ChangeFormState, fd: FormData): Promise<ChangeFormState> {
  let to: string;
  try {
    await updateChange(await actor(), id, parse(fd));
    to = await docOf(id);
  } catch (e) {
    if (isDomainError(e)) return { error: e.message, values: valuesOf(fd) };
    throw e;
  }
  revalidatePath('/', 'layout');
  redirect(to);
}

export async function submitAction(id: string) {
  await runAction(await docOf(id), async () => { await submitChange(await actor(), id); });
}
/** decision ถูกผูกมากับ action (bind) ไม่ได้อ่านจากฟอร์ม — ใช้ได้แม้กดก่อน JS โหลดเสร็จ */
export async function decideAction(id: string, decision: 'APPROVED' | 'REJECTED', fd: FormData) {
  await runAction(await docOf(id), async () => {
    await decideApproval(await actor(), id, decision, str(fd, 'comment'));
  });
}
export async function scheduleAction(id: string) {
  await runAction(await docOf(id), async () => { await scheduleChange(await actor(), id); });
}
export async function startAction(id: string) {
  await runAction(await docOf(id), async () => { await startChange(await actor(), id); });
}
export async function completeAction(id: string, fd: FormData) {
  await runAction(await docOf(id), async () => { await completeChange(await actor(), id, str(fd, 'outcome')); });
}
export async function failAction(id: string, fd: FormData) {
  await runAction(await docOf(id), async () => { await failChange(await actor(), id, str(fd, 'outcome')); });
}
export async function cancelAction(id: string, fd: FormData) {
  await runAction(await docOf(id), async () => { await cancelChange(await actor(), id, str(fd, 'reason')); });
}
