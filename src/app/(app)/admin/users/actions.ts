'use server';

import { getCurrentUser } from '@/lib/currentUser';
import { isDomainError } from '@/lib/errors';
import { runAction } from '@/lib/actionUtils';
import type { Role } from '@/lib/permissions';
import { createUser, resetPassword, updateUser } from '@/lib/userService';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function actor() {
  const u = await getCurrentUser();
  return { id: u.id, role: u.role as Role };
}

/** ผลที่ส่งกลับไปแสดงในหน้า — รหัสผ่านชั่วคราวอยู่ใน response นี้เท่านั้น (ไม่เข้า URL ไม่เก็บใน DB เป็นข้อความธรรมดา) */
export type SecretState = { error?: string; email?: string; tempPassword?: string | null; userId?: string } | undefined;

export async function createUserAction(_: SecretState, fd: FormData): Promise<SecretState> {
  try {
    const r = await createUser(await actor(), {
      email: str(fd, 'email'), name: str(fd, 'name'), role: str(fd, 'role'), groupId: str(fd, 'groupId') || null, ssoOnly: fd.get('ssoOnly') === 'on',
    });
    return { email: str(fd, 'email').toLowerCase(), tempPassword: r.tempPassword, userId: r.id };
  } catch (e) {
    if (isDomainError(e)) return { error: e.message };
    throw e;
  }
}

export async function resetPasswordAction(id: string): Promise<SecretState> {
  try {
    return { tempPassword: await resetPassword(await actor(), id), userId: id };
  } catch (e) {
    if (isDomainError(e)) return { error: e.message };
    throw e;
  }
}

export async function updateUserAction(id: string, fd: FormData) {
  await runAction(`/admin/users/${id}`, async () => {
    await updateUser(await actor(), id, { name: str(fd, 'name'), role: str(fd, 'role'), groupId: str(fd, 'groupId') || null, active: fd.get('active') === 'on' });
  });
}
