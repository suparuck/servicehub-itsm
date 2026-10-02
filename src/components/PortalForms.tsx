'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { th } from '@/i18n/th';
import { portalField, portalLabel } from './portalBits';
import type { PortalFormState } from '@/app/(portal)/portal/actions';

type Opt = { id: string; name: string };
const box = 'flex flex-col gap-4 rounded-card border border-border bg-surface p-5';

function Err({ msg }: { msg?: string }) {
  return msg ? (
    <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{msg}</div>
  ) : null;
}

function Choice({ name, legend, options, value }: { name: string; legend: string; options: Record<string, string>; value: string }) {
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className={`${portalLabel} mb-1 p-0`}>{legend}</legend>
      {Object.entries(options).map(([k, label]) => (
        <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border border-border bg-surface px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-tint">
          <input type="radio" name={name} value={k} defaultChecked={k === value} className="h-4 w-4" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function IncidentReportForm({
  action, services, initialTitle,
}: {
  action: (s: PortalFormState, fd: FormData) => Promise<PortalFormState>;
  services: Opt[];
  initialTitle?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const f = th.portal.incidentForm;
  const v = state?.values;
  const val = (k: string, d = '') => (v ? (v[k] ?? '') : d);
  const rk = state?.error ?? '';

  return (
    <form action={formAction} key={rk} className={box}>
      <Err msg={state?.error} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={portalLabel}>{f.subject} <span aria-hidden="true" className="text-critical">*</span></label>
        <input id="title" name="title" required maxLength={200} defaultValue={val('title', initialTitle)} placeholder={f.subjectHint} className={portalField} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="serviceId" className={portalLabel}>{f.service}</label>
        <select id="serviceId" name="serviceId" defaultValue={val('serviceId')} className={portalField}>
          <option value="">{f.serviceNone}</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={portalLabel}>{f.description}</label>
        <textarea id="description" name="description" rows={5} defaultValue={val('description')} aria-describedby="d-hint" className={`${portalField} py-3 leading-relaxed`} />
        <span id="d-hint" className="text-xs text-muted">{f.descriptionHint}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Choice name="scope" legend={f.scope} options={f.scopeOptions} value={val('scope', 'LOW')} />
        <Choice name="block" legend={f.block} options={f.blockOptions} value={val('block', 'MED')} />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">{pending ? f.saving : f.submit}</button>
        <Link href="/portal" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{f.cancel}</Link>
      </div>
    </form>
  );
}

export function RequestForm({
  action, items, initialItem, initialTitle,
}: {
  action: (s: PortalFormState, fd: FormData) => Promise<PortalFormState>;
  items: Opt[];
  initialItem?: string;
  initialTitle?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const f = th.portal.requestForm;
  const v = state?.values;
  const val = (k: string, d = '') => (v ? (v[k] ?? '') : d);
  const rk = state?.error ?? '';

  return (
    <form action={formAction} key={rk} className={box}>
      <Err msg={state?.error} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="catalogId" className={portalLabel}>{f.item} <span aria-hidden="true" className="text-critical">*</span></label>
        <select id="catalogId" name="catalogId" required defaultValue={val('catalogId', initialItem)} className={portalField}>
          <option value="" disabled>—</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={portalLabel}>{f.subject} <span aria-hidden="true" className="text-critical">*</span></label>
        <input id="title" name="title" required maxLength={200} defaultValue={val('title', initialTitle)} placeholder={f.subjectHint} className={portalField} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={portalLabel}>{f.description}</label>
        <textarea id="description" name="description" rows={5} defaultValue={val('description')} aria-describedby="r-hint" className={`${portalField} py-3 leading-relaxed`} />
        <span id="r-hint" className="text-xs text-muted">{f.descriptionHint}</span>
      </div>
      <span className="text-xs text-muted">{f.flow}</span>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">{pending ? f.saving : f.submit}</button>
        <Link href="/portal/catalog" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{f.cancel}</Link>
      </div>
    </form>
  );
}
