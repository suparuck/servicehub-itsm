'use client';

import { useActionState } from 'react';
import { th } from '@/i18n/th';
import { changePasswordAction } from './actions';

const field = 'box-border min-h-12 w-full rounded-control border border-input bg-surface px-3.5 text-base';

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, undefined);
  const t = th.account;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state?.error && (
        <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">
          {state.error}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="current" className="text-sm font-medium">{t.current}</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="next" className="text-sm font-medium">{t.next}</label>
        <input id="next" name="next" type="password" autoComplete="new-password" required aria-describedby="policy" className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">{t.confirm}</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={field} />
      </div>
      <button type="submit" disabled={pending} className="h-12 rounded-control bg-accent text-base font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
        {pending ? t.saving : t.submit}
      </button>
    </form>
  );
}
