'use server';

import { redirect } from 'next/navigation';
import { isDomainError } from '@/lib/errors';
import { redeemToken } from '@/lib/passwordReset';

export type ResetState = { error?: string } | undefined;

export async function resetPasswordAction(_: ResetState, fd: FormData): Promise<ResetState> {
  try {
    await redeemToken(String(fd.get('token') ?? ''), { next: String(fd.get('next') ?? ''), confirm: String(fd.get('confirm') ?? '') });
  } catch (e) {
    if (isDomainError(e)) return { error: e.message };
    throw e;
  }
  redirect('/login?reason=reset');
}
