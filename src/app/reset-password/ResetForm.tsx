'use client';

import { useActionState } from 'react';
import { th } from '@/i18n/th';
import { resetPasswordAction } from './actions';

const field = 'box-border min-h-12 w-full rounded-control border border-input bg-surface px-3.5 text-base';

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, undefined);
  const t = th.reset;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {state?.error && (
        <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{state.error}</div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="next" className="text-sm font-medium">{t.next}</label>
        <input id="next" name="next" type="password" autoComplete="new-password" required aria-describedby="policy" className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">{t.confirm}</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={field} />
      </div>
      <ul id="policy" className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-sm text-muted">
        {th.account.policy.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <button type="submit" disabled={pending} className="h-12 rounded-control bg-accent text-base font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
        {pending ? t.saving : t.submit}
      </button>
    </form>
  );
}
