'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { th } from '@/i18n/th';
import type { ChangeFormState } from '@/app/(app)/changes/actions';

type Opt = { id: string; name: string };
export interface ChangeFormProps {
  action: (s: ChangeFormState, fd: FormData) => Promise<ChangeFormState>;
  mode: 'new' | 'edit';
  cancelHref: string;
  services: Opt[];
  problems: Opt[];
  cis: (Opt & { sub?: string })[];
  initial?: {
    title: string; type: string; risk: string; windowStart: string; windowEnd: string; serviceId: string; problemId: string;
    description: string; implementationPlan: string; backoutPlan: string; ciIds: string[];
  };
}

const field = 'box-border min-h-11 w-full rounded-control border border-input bg-surface px-3 text-sm';
const label = 'text-[13px] font-medium text-ink';

export function ChangeForm(p: ChangeFormProps) {
  const [state, formAction, pending] = useActionState(p.action, undefined);
  const f = th.change.form;
  const i = p.initial;
  const v = state?.values;
  const val = (k: string, d = '') => (v ? String(v[k] ?? '') : d);
  const rk = state?.error ?? '';

  return (
    <form action={formAction} key={rk} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
      {state?.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{state.error}</div>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={label}>{f.title} <span aria-hidden="true" className="text-critical">*</span></label>
        <input id="title" name="title" required maxLength={200} defaultValue={val('title', i?.title)} className={field} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="type" className={label}>{f.type}</label>
          <select id="type" name="type" defaultValue={val('type', i?.type ?? 'NORMAL')} className={field}>
            {(Object.keys(f.typeHelp) as (keyof typeof f.typeHelp)[]).map((k) => <option key={k} value={k}>{f.typeHelp[k]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="risk" className={label}>{f.risk}</label>
          <select id="risk" name="risk" defaultValue={val('risk', i?.risk ?? 'MED')} className={field}>
            {(['LOW', 'MED', 'HIGH'] as const).map((k) => <option key={k} value={k}>{th.risk[k]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="windowStart" className={label}>{f.start} <span aria-hidden="true" className="text-critical">*</span></label>
          <input id="windowStart" name="windowStart" type="datetime-local" required defaultValue={val('windowStart', i?.windowStart)} className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="windowEnd" className={label}>{f.end}</label>
          <input id="windowEnd" name="windowEnd" type="datetime-local" defaultValue={val('windowEnd', i?.windowEnd)} className={field} />
        </div>
        <Select id="serviceId" label={f.service} none={f.none} options={p.services} value={val('serviceId', i?.serviceId)} />
        <Select id="problemId" label={f.problem} none={f.none} options={p.problems} value={val('problemId', i?.problemId)} />
      </div>
      {[
        ['description', f.description, i?.description, 3],
        ['implementationPlan', f.impl, i?.implementationPlan, 4],
        ['backoutPlan', f.backout, i?.backoutPlan, 3],
      ].map(([k, text, init, rows]) => (
        <div key={k as string} className="flex flex-col gap-1.5">
          <label htmlFor={k as string} className={label}>{text as string}</label>
          <textarea id={k as string} name={k as string} rows={rows as number} defaultValue={val(k as string, init as string)} className={`${field} py-3 leading-relaxed`} />
        </div>
      ))}
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className={`${label} mb-1.5 p-0`}>{f.cis}</legend>
        <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-control border border-border p-2 md:grid-cols-2">
          {p.cis.map((c) => (
            <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-subtle">
              <input type="checkbox" name="ciIds" value={c.id} defaultChecked={v ? [v.ciIds ?? []].flat().includes(c.id) : i?.ciIds.includes(c.id)} className="h-4 w-4" />
              <span className="flex flex-col"><span className="font-medium">{c.name}</span>{c.sub && <span className="text-xs text-muted">{c.sub}</span>}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">{pending ? f.saving : p.mode === 'new' ? f.submitNew : f.submitEdit}</button>
        <Link href={p.cancelHref} className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{th.common.cancel}</Link>
      </div>
    </form>
  );
}

function Select({ id, label: text, none, options, value }: { id: string; label: string; none: string; options: Opt[]; value?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={label}>{text}</label>
      <select id={id} name={id} defaultValue={value ?? ''} className={field}>
        <option value="">{none}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}
