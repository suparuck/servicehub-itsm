'use client';

import { useActionState, useState } from 'react';
import { th } from '@/i18n/th';
import { createSourceAction, rotateSourceAction, type TokenState } from '@/app/(app)/monitoring/actions';

const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';

/** แสดง token ครั้งเดียว พร้อมปุ่มคัดลอก */
function TokenReveal({ name, token }: { name?: string; token: string }) {
  const [copied, setCopied] = useState(false);
  const t = th.monitoring.sources;
  return (
    <div className="flex flex-col gap-2 rounded-control border border-warn bg-warn-tint p-3" role="status">
      <strong className="text-sm text-warn-fg">{t.tokenTitle}{name ? `: ${name}` : ''}</strong>
      <div className="flex flex-wrap items-center gap-2">
        <code data-testid="source-token" className="select-all break-all rounded bg-surface px-3 py-2 font-mono text-sm font-semibold text-ink">{token}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(token);
              setCopied(true);
            } catch {
              /* คัดลอกไม่ได้ (เช่น ไม่ใช่ https) — ผู้ใช้เลือกข้อความเอง */
            }
          }}
          className="h-11 rounded-control border border-input bg-surface px-4 text-sm"
        >
          {copied ? th.admin.copied : th.admin.copy}
        </button>
      </div>
      <span className="text-xs text-warn-fg">{t.tokenWarn}</span>
    </div>
  );
}

export function CreateSourceForm() {
  const [state, formAction, pending] = useActionState<TokenState, FormData>(createSourceAction, undefined);
  const t = th.monitoring.sources;
  return (
    <div className="flex flex-col gap-3">
      {state?.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{state.error}</div>}
      {state?.token && <TokenReveal name={state.name} token={state.token} />}
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-[13px] font-medium">{t.name}
          <input name="name" required maxLength={80} className={field} />
        </label>
        <button type="submit" disabled={pending} className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white disabled:opacity-60">{t.add}</button>
      </form>
    </div>
  );
}

export function RotateTokenForm({ id, name }: { id: string; name: string }) {
  const [state, formAction, pending] = useActionState<TokenState, FormData>(rotateSourceAction.bind(null, id), undefined);
  const t = th.monitoring.sources;
  return (
    <div className="flex flex-col gap-2">
      {state?.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2 text-sm text-critical-fg">{state.error}</div>}
      {state?.token && <TokenReveal name={state.name} token={state.token} />}
      <form action={formAction}>
        <button type="submit" disabled={pending} aria-label={`${t.rotate} ${name}`} className="h-11 rounded-control border border-input bg-surface px-4 text-sm disabled:opacity-60">{t.rotate}</button>
      </form>
    </div>
  );
}
