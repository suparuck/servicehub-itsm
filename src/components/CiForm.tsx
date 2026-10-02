'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { th } from '@/i18n/th';
import type { CiFormState } from '@/app/cmdb/actions';

type Opt = { id: string; name: string };
export interface CiFormProps {
  action: (state: CiFormState, fd: FormData) => Promise<CiFormState>;
  mode: 'new' | 'edit';
  cancelHref: string;
  groups: Opt[];
  users: Opt[];
  initial?: {
    name: string; subtitle: string; ciClass: string; classLabel: string; environment: string; lifecycle: string;
    ownerGroupId: string; ownerUserId: string; ownerLabel: string; attributes: string;
  };
}

const field = 'box-border min-h-11 w-full rounded-control border border-input bg-surface px-3 text-sm';
const label = 'text-[13px] font-medium text-ink';

export function CiForm(p: CiFormProps) {
  const [state, formAction, pending] = useActionState(p.action, undefined);
  const f = th.cmdb.form;
  const i = p.initial;
  const v = state?.values;
  const val = (k: keyof NonNullable<CiFormProps['initial']>, formKey: string = k) => (v ? (v[formKey] ?? '') : (i?.[k] ?? ''));
  const rk = state?.error ?? '';

  return (
    <form action={formAction} key={rk} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
      {state?.error && (
        <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{state.error}</div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={label}>{f.name} <span aria-hidden="true" className="text-critical">*</span></label>
        <input id="name" name="name" required maxLength={150} defaultValue={val('name')} className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="subtitle" className={label}>{f.subtitle}</label>
        <input id="subtitle" name="subtitle" defaultValue={val('subtitle')} className={field} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ciClass" className={label}>{f.ciClass}</label>
          <select id="ciClass" name="ciClass" defaultValue={v ? v.ciClass : (i?.ciClass ?? 'APPLICATION')} className={field}>
            {(Object.keys(th.cmdb.classes) as (keyof typeof th.cmdb.classes)[]).map((k) => <option key={k} value={k}>{th.cmdb.classes[k]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="classLabel" className={label}>{f.classLabel}</label>
          <input id="classLabel" name="classLabel" defaultValue={val('classLabel')} placeholder="เช่น Application Server" className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="environment" className={label}>{f.env}</label>
          <select id="environment" name="environment" defaultValue={v ? v.environment : (i?.environment ?? 'Prod')} className={field}>
            {(Object.keys(th.cmdb.envs) as (keyof typeof th.cmdb.envs)[]).map((k) => <option key={k} value={k}>{th.cmdb.envs[k]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lifecycle" className={label}>{f.lifecycle}</label>
          <select id="lifecycle" name="lifecycle" defaultValue={v ? v.lifecycle : (i?.lifecycle ?? 'LIVE')} className={field}>
            {(Object.keys(th.cmdb.lifecycle) as (keyof typeof th.cmdb.lifecycle)[]).map((k) => <option key={k} value={k}>{th.cmdb.lifecycle[k]}</option>)}
          </select>
        </div>
        <Select id="ownerGroupId" label={f.ownerGroup} none={f.none} options={p.groups} value={val('ownerGroupId')} />
        <Select id="ownerUserId" label={f.ownerUser} none={f.none} options={p.users} value={val('ownerUserId')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ownerLabel" className={label}>{f.ownerLabel}</label>
        <input id="ownerLabel" name="ownerLabel" defaultValue={val('ownerLabel')} className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="attributes" className={label}>{f.attrs}</label>
        <textarea id="attributes" name="attributes" rows={7} defaultValue={val('attributes')} aria-describedby="attrs-hint" className={`${field} py-3 font-mono leading-relaxed`} />
        <span id="attrs-hint" className="text-xs text-muted">{f.attrsHint}</span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
          {pending ? f.saving : p.mode === 'new' ? f.submitNew : f.submitEdit}
        </button>
        <Link href={p.cancelHref} className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{f.cancel}</Link>
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
