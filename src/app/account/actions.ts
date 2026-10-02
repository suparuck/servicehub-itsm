'use server';

import { signOut } from '@/auth';
import { getCurrentUser } from '@/lib/currentUser';
import { isDomainError } from '@/lib/errors';
import { clearFailures, isLocked, minutesUntilUnlock, recordFailure } from '@/lib/rateLimit';
import { WrongPasswordError, changeOwnPassword } from '@/lib/userService';
import { th } from '@/i18n/th';

export type PasswordState = { error?: string } | undefined;

export async function changePasswordAction(_: PasswordState, fd: FormData): Promise<PasswordState> {
  const user = await getCurrentUser({ allowMustChange: true });
  // จำกัดการลองรหัสปัจจุบัน — กัน session ที่ถูกขโมยใช้เดารหัสผ่านเดิม
  const key = `pw:${user.id}`;
  if (isLocked(key)) return { error: th.account.locked(minutesUntilUnlock(key)) };
  try {
    await changeOwnPassword(user.id, {
      current: String(fd.get('current') ?? ''),
      next: String(fd.get('next') ?? ''),
      confirm: String(fd.get('confirm') ?? ''),
    });
  } catch (e) {
    if (e instanceof WrongPasswordError) recordFailure(key);
    if (isDomainError(e)) return { error: e.message };
    throw e;
  }
  clearFailures(key);
  // ออกจากระบบแล้วให้เข้าใหม่ด้วยรหัสใหม่ (session เดิมทุกอุปกรณ์ใช้ไม่ได้อยู่แล้วจาก passwordChangedAt)
  await signOut({ redirectTo: '/login?reason=changed' });
}
