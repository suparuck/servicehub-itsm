'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { th } from '@/i18n/th';
import { forgotPasswordAction } from './actions';

const field = 'box-border min-h-12 w-full rounded-control border border-input bg-surface px-3.5 text-base';

export function ForgotForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, undefined);
  const t = th.reset;
  if (state?.sent) {
    return (
      <div className="flex flex-col gap-4">
        <div role="status" className="flex flex-col gap-1.5 rounded-control border border-ok bg-ok-tint px-3.5 py-3 text-sm text-ok-fg">
          <strong className="text-base">{t.sentTitle}</strong>
          <span>{t.sentBody}</span>
        </div>
        <p className="m-0 text-sm text-muted">{t.sentHint}</p>
        <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">{t.backToLogin}</Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state?.error && (
        <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{state.error}</div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">{t.email}</label>
        <input id="email" name="email" type="email" autoComplete="username" required className={field} />
      </div>
      <button type="submit" disabled={pending} className="h-12 rounded-control bg-accent text-base font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
        {pending ? t.sending : t.send}
      </button>
      <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">{t.backToLogin}</Link>
    </form>
  );
}
