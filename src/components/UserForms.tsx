'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { th } from '@/i18n/th';
import { ROLE_LABEL, type Role } from '@/lib/permissions';
import { createUserAction, resetPasswordAction, type SecretState } from '@/app/(app)/admin/users/actions';

const field = 'box-border min-h-11 w-full rounded-control border border-input bg-surface px-3 text-sm';

/** แสดงรหัสผ่านชั่วคราวครั้งเดียว พร้อมปุ่มคัดลอก */
function TempPassword({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const t = th.admin;
  return (
    <div className="flex flex-col gap-2 rounded-control border border-warn bg-warn-tint p-3" role="status">
      <strong className="text-sm text-warn-fg">{t.tempTitle}</strong>
      <div className="flex flex-wrap items-center gap-2">
        <code data-testid="temp-password" className="select-all rounded bg-surface px-3 py-2 font-mono text-base font-semibold text-ink">{value}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              /* คัดลอกไม่ได้ (เช่น ไม่ใช่ https) — ผู้ใช้เลือกข้อความเอง */
            }
          }}
          className="h-11 rounded-control border border-input bg-surface px-4 text-sm"
        >
          {copied ? t.copied : t.copy}
        </button>
      </div>
      <span className="text-xs text-warn-fg">{t.tempWarn}</span>
    </div>
  );
}

export function CreateUserForm({ groups }: { groups: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<SecretState, FormData>(createUserAction, undefined);
  const t = th.admin;
  const f = t.form;

  if (state?.userId) {
    return (
      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <h2 className="m-0 text-[17px] font-semibold">{t.created}: {state.email}</h2>
        {state.tempPassword ? <TempPassword value={state.tempPassword} /> : <p className="m-0 text-sm text-muted">{t.noPassword}</p>}
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/users/${state.userId}`} className="inline-flex h-11 items-center rounded-control bg-accent px-5 text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{t.toList}</Link>
          <Link href="/admin/users/new" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{t.createAnother}</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
      {state?.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{state.error}</div>}
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.email} <input name="email" type="email" required autoComplete="off" className={field} /></label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.name} <input name="name" required maxLength={100} className={field} /></label>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.role}
          <select name="role" defaultValue="AGENT" className={field}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.group}
          <select name="groupId" defaultValue="" className={field}>
            <option value="">{f.none}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2.5 text-sm"><input type="checkbox" name="ssoOnly" className="h-4 w-4" />{f.sso}</label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">{f.submit}</button>
        <Link href="/admin/users" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{th.common.cancel}</Link>
      </div>
    </form>
  );
}

export function ResetPasswordPanel({ userId, disabledReason }: { userId: string; disabledReason?: string }) {
  const [state, formAction, pending] = useActionState<SecretState, FormData>(resetPasswordAction.bind(null, userId), undefined);
  const t = th.admin;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">{t.resetHint}</p>
      {state?.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{state.error}</div>}
      {state?.tempPassword && <TempPassword value={state.tempPassword} />}
      {disabledReason ? (
        <p className="m-0 text-xs text-muted">{disabledReason}</p>
      ) : (
        <form action={formAction}>
          <button type="submit" disabled={pending} className="h-11 rounded-control border border-input bg-surface px-5 text-sm text-critical-fg disabled:opacity-60">{t.resetBtn}</button>
        </form>
      )}
    </div>
  );
}
