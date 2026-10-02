'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { th } from '@/i18n/th';
import { calcPriority, LEVELS, type Level } from '@/lib/priority';
import { PriorityChip } from './ui';
import type { FormState } from '@/app/incidents/actions';

type Opt = { id: string; name: string };
export interface IncidentFormProps {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  mode: 'new' | 'edit';
  cancelHref: string;
  services: Opt[];
  groups: Opt[];
  users: Opt[];
  cis: (Opt & { sub?: string })[];
  initial?: {
    title: string;
    description: string;
    impact: Level;
    urgency: Level;
    serviceId: string;
    groupId: string;
    assigneeId: string;
    category: string;
    ciIds: string[];
  };
}

const field = 'box-border min-h-11 w-full rounded-control border border-input bg-surface px-3 text-sm';
const label = 'text-[13px] font-medium text-ink';

export function IncidentForm(p: IncidentFormProps) {
  const [state, formAction, pending] = useActionState(p.action, undefined);
  const [impact, setImpact] = useState<Level>(p.initial?.impact ?? 'MED');
  const [urgency, setUrgency] = useState<Level>(p.initial?.urgency ?? 'MED');
  const f = th.incident.form;
  const priority = calcPriority(impact, urgency);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
      {state?.error && (
        <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={label}>{f.title} <span aria-hidden="true" className="text-critical">*</span></label>
        <input id="title" name="title" required maxLength={200} defaultValue={p.initial?.title} placeholder={f.titleHint} className={field} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={label}>{f.description}</label>
        <textarea id="description" name="description" rows={5} defaultValue={p.initial?.description} className={`${field} py-3 leading-relaxed`} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="impact" className={label}>{f.impact}</label>
          <select id="impact" name="impact" value={impact} onChange={(e) => setImpact(e.target.value as Level)} className={field}>
            {LEVELS.map((l) => <option key={l} value={l}>{th.incident.impactHelp[l]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="urgency" className={label}>{f.urgency}</label>
          <select id="urgency" name="urgency" value={urgency} onChange={(e) => setUrgency(e.target.value as Level)} className={field}>
            {LEVELS.map((l) => <option key={l} value={l}>{th.incident.urgencyHelp[l]}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-control bg-subtle px-3 py-2.5" aria-live="polite">
        <span className="text-[13px] text-muted">{f.priority}</span>
        <PriorityChip priority={priority} />
        <span className="text-xs text-muted">{f.priorityHint}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Select id="serviceId" label={f.service} none={f.none} options={p.services} value={p.initial?.serviceId} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category" className={label}>{f.category}</label>
          <input id="category" name="category" defaultValue={p.initial?.category} placeholder="เช่น แอปพลิเคชัน › การเข้าถึง" className={field} />
        </div>
        <Select id="groupId" label={f.group} none={f.none} options={p.groups} value={p.initial?.groupId} />
        <Select id="assigneeId" label={f.assignee} none={f.none} options={p.users} value={p.initial?.assigneeId} />
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className={`${label} mb-1.5 p-0`}>{f.cis}</legend>
        <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-control border border-border p-2 md:grid-cols-2">
          {p.cis.map((c) => (
            <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-subtle">
              <input type="checkbox" name="ciIds" value={c.id} defaultChecked={p.initial?.ciIds.includes(c.id)} className="h-4 w-4" />
              <span className="flex flex-col">
                <span className="font-medium">{c.name}</span>
                {c.sub && <span className="text-xs text-muted">{c.sub}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
          {pending ? f.saving : p.mode === 'new' ? f.submitNew : f.submitEdit}
        </button>
        <Link href={p.cancelHref} className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">
          {f.cancel}
        </Link>
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
