'use server';

import { revalidatePath } from 'next/cache';
import { runAction } from '@/lib/actionUtils';
import { getCurrentUser } from '@/lib/currentUser';
import { isDomainError } from '@/lib/errors';
import type { Role } from '@/lib/permissions';
import { acknowledgeEvent, createIncidentFromEvent, createSource, resolveEvent, rotateSourceToken, updateSource } from '@/lib/monitoringService';

// ทุก action ผ่าน getCurrentUser + assertCan ใน service — server action ถูกเรียกได้จากทุกที่ ห้ามเชื่อแค่การซ่อนปุ่ม
async function actor() {
  const u = await getCurrentUser();
  return { id: u.id, role: u.role as Role };
}

/** ผลที่แสดงในหน้า — token จริงอยู่ใน response นี้เท่านั้น (ไม่เข้า URL ไม่เก็บใน DB เป็นข้อความที่อ่านได้) */
export type TokenState = { error?: string; token?: string; name?: string } | undefined;

export async function createSourceAction(_: TokenState, fd: FormData): Promise<TokenState> {
  try {
    const r = await createSource(await actor(), String(fd.get('name') ?? ''));
    revalidatePath('/monitoring/sources');
    return { token: r.token, name: r.name };
  } catch (e) {
    if (isDomainError(e)) return { error: e.message };
    throw e;
  }
}

export async function rotateSourceAction(id: string): Promise<TokenState> {
  try {
    const r = await rotateSourceToken(await actor(), id);
    revalidatePath('/monitoring/sources');
    return { token: r.token, name: r.name };
  } catch (e) {
    if (isDomainError(e)) return { error: e.message };
    throw e;
  }
}

export async function updateSourceAction(id: string, patch: { active?: boolean; autoIncident?: boolean }) {
  await runAction('/monitoring/sources', async () => { await updateSource(await actor(), id, patch); });
}

export async function ackEventAction(id: string) {
  await runAction('/monitoring', async () => { await acknowledgeEvent(await actor(), id); });
}

export async function resolveEventAction(id: string) {
  await runAction('/monitoring', async () => { await resolveEvent(await actor(), id); });
}

export async function makeIncidentAction(id: string) {
  await runAction('/monitoring', async () => `/incidents/${await createIncidentFromEvent(await actor(), id)}`);
}
