'use server';

import { AuthError } from 'next-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/auth';
import { MAX_FAILURES_PER_IP, clearFailures, isLocked, minutesUntilUnlock, recordFailure } from '@/lib/rateLimit';
import { db } from '@/lib/db';
import type { Role } from '@/lib/permissions';
import { checkAccess, homeFor, safeCallback } from '@/lib/routeAccess';

export type LoginState = { error?: string; email?: string } | undefined;

async function clientIp() {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim();
}

export async function loginAction(_: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const redirectTo = safeCallback(String(fd.get('callbackUrl') ?? ''));
  if (!email || !password) return { error: 'กรุณากรอกอีเมลและรหัสผ่าน', email };

  const keys = [`email:${email}`, `ip:${await clientIp()}`];
  const locked = keys.find((k) => isLocked(k, Date.now(), k.startsWith('ip:') ? MAX_FAILURES_PER_IP : undefined));
  if (locked) return { error: `ลองผิดหลายครั้งเกินไป กรุณารอ ${minutesUntilUnlock(locked)} นาทีแล้วลองใหม่`, email };

  try {
    // redirect:false แล้วเลือกปลายทางตามบทบาทเอง — การนำทางฝั่ง client หลัง action ไม่ตาม redirect ของ middleware
    await signIn('credentials', { email, password, redirect: false });
  } catch (e) {
    if (e instanceof AuthError) {
      keys.forEach((k) => recordFailure(k));
      // ข้อความเดียวกันไม่ว่าอีเมลมีอยู่หรือไม่ (ไม่เปิดเผยว่าบัญชีมีในระบบ)
      return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', email };
    }
    throw e;
  }
  clearFailures(keys[0]);
  const user = await db.user.findUnique({ where: { email }, select: { role: true } });
  const role = user?.role as Role | undefined;
  redirect(checkAccess(redirectTo, role).allow && redirectTo !== '/' ? redirectTo : homeFor(role));
}

export async function entraLoginAction(fd: FormData) {
  await signIn('microsoft-entra-id', { redirectTo: safeCallback(String(fd.get('callbackUrl') ?? '')) });
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' });
}
