'use client';

import Link from 'next/link';
import { useState } from 'react';
import { th } from '@/i18n/th';
import { DESK_CHANNELS } from '@/lib/serviceDesk';
import { logOnBehalfAction } from '@/app/(app)/service-desk/actions';

const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';

/** ฟอร์มบันทึกแทนผู้ใช้ — สลับช่องกรอกตามประเภท (Incident: ผลกระทบ/ความเร่งด่วน/บริการ · คำขอ: รายการที่ขอ) */
export function DeskLogForm({ error, callers, services, catalog }: { error?: string; callers: { id: string; name: string; email: string }[]; services: { id: string; name: string }[]; catalog: { id: string; name: string }[] }) {
  const f = th.desk.log;
  const [type, setType] = useState<'INC' | 'REQ'>('INC');
  return (
    <form action={logOnBehalfAction} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
      {error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{error}</div>}
      <p className="m-0 text-sm text-muted">{f.sub}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.caller} <span aria-hidden="true" className="text-critical">*</span>
          <select name="callerId" required defaultValue="" className={field}>
            <option value="" disabled>{f.callerPick}</option>
            {callers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.channel} <span aria-hidden="true" className="text-critical">*</span>
          <select name="channel" required defaultValue="โทรศัพท์" className={field}>
            {DESK_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="m-0 flex flex-wrap gap-x-6 border-0 p-0">
        <legend className="mb-1 p-0 text-[13px] font-medium">{f.type}</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="type" value="INC" checked={type === 'INC'} onChange={() => setType('INC')} className="h-4 w-4" />{f.incident}</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="type" value="REQ" checked={type === 'REQ'} onChange={() => setType('REQ')} className="h-4 w-4" />{f.request}</label>
      </fieldset>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.titleField} <span aria-hidden="true" className="text-critical">*</span>
        <input name="title" required maxLength={200} className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.description}
        <textarea name="description" rows={4} maxLength={4000} className={`${field} py-3`} />
      </label>
      {type === 'INC' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.impact}
            <select name="impact" defaultValue="MED" className={field}>{(['HIGH', 'MED', 'LOW'] as const).map((l) => <option key={l} value={l}>{f.levels[l]}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.urgency}
            <select name="urgency" defaultValue="MED" className={field}>{(['HIGH', 'MED', 'LOW'] as const).map((l) => <option key={l} value={l}>{f.levels[l]}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.service}
            <select name="serviceId" defaultValue="" className={field}>
              <option value="">{f.none}</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <span className="text-xs text-muted md:col-span-3">{f.priorityHint} · {f.ruleHint}</span>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.catalog} <span aria-hidden="true" className="text-critical">*</span>
          <select name="catalogId" required defaultValue="" className={field}>
            <option value="" disabled>{f.none}</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{f.submit}</button>
        <Link href="/service-desk" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{f.cancel}</Link>
      </div>
    </form>
  );
}
