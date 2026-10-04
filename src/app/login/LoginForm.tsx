'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { th } from '@/i18n/th';
import { loginAction } from './actions';

const field = 'box-border min-h-12 w-full rounded-control border border-input bg-surface px-3.5 text-base';

export function LoginForm({ callbackUrl, notice, info }: { callbackUrl: string; notice?: string; info?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const message = state?.error ?? notice;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {info && !message && (
        <div role="status" className="rounded-control border border-ok bg-ok-tint px-3 py-2.5 text-sm text-ok-fg">{info}</div>
      )}
      {message && (
        <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">
          {message}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">อีเมล</label>
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state?.email} className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">รหัสผ่าน</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={field} />
      </div>
      <Link href="/forgot-password" className="-mt-1 inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent">{th.reset.forgotLink}</Link>
      <button type="submit" disabled={pending} className="h-12 rounded-control bg-accent text-base font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
        {pending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </button>
    </form>
  );
}
