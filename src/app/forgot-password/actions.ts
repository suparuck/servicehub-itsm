'use server';

import { headers } from 'next/headers';
import { requestPasswordReset } from '@/lib/passwordReset';

export type ForgotState = { sent?: boolean; error?: string } | undefined;

export async function forgotPasswordAction(_: ForgotState, fd: FormData): Promise<ForgotState> {
  const email = String(fd.get('email') ?? '').trim();
  if (!email) return { error: 'กรุณากรอกอีเมล' };
  const h = await headers();
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim();
  try {
    await requestPasswordReset(email, ip);
  } catch (e) {
    // ล้มเหลวภายใน (เช่น DB) ก็ตอบเหมือนสำเร็จ — ไม่ให้ผู้ภายนอกแยกกรณีได้ แต่บันทึกไว้ให้ผู้ดูแล
    console.error('[reset] request failed', e instanceof Error ? e.message : e);
  }
  return { sent: true };
}
