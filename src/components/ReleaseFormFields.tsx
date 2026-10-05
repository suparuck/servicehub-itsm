import { th } from '@/i18n/th';

const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';

export interface RelDefaults {
  name?: string;
  version?: string | null;
  description?: string | null;
  ownerId?: string | null;
  serviceId?: string | null;
  windowStart?: Date | null;
  windowEnd?: Date | null;
  deployPlan?: string | null;
  rollbackPlan?: string | null;
}

/** Date → ค่าของ <input type=datetime-local> เวลาไทย (YYYY-MM-DDTHH:mm) */
const toLocal = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 16) : '');

/** ฟิลด์ฟอร์ม Release (ใช้ทั้งหน้าสร้างและหน้าแก้ไข) */
export function ReleaseFormFields({ d, options }: { d: RelDefaults; options: { owners: { id: string; name: string }[]; services: { id: string; code: string; name: string }[] } }) {
  const f = th.release.form;
  const area = `${field} py-3`;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.name} <span aria-hidden="true" className="text-critical">*</span>
          <input name="name" required maxLength={150} defaultValue={d.name ?? ''} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.version}
          <input name="version" maxLength={40} defaultValue={d.version ?? ''} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.description}
        <textarea name="description" rows={3} maxLength={4000} defaultValue={d.description ?? ''} className={area} />
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.owner}
          <select name="ownerId" defaultValue={d.ownerId ?? ''} className={field}>
            <option value="">{f.none}</option>
            {options.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.service}
          <select name="serviceId" defaultValue={d.serviceId ?? ''} className={field}>
            <option value="">{f.none}</option>
            {options.services.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.start}
          <input name="windowStart" type="datetime-local" defaultValue={toLocal(d.windowStart)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.end}
          <input name="windowEnd" type="datetime-local" defaultValue={toLocal(d.windowEnd)} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.deployPlan}
        <textarea name="deployPlan" rows={4} maxLength={4000} defaultValue={d.deployPlan ?? ''} className={area} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.rollbackPlan}
        <textarea name="rollbackPlan" rows={3} maxLength={4000} defaultValue={d.rollbackPlan ?? ''} className={area} />
      </label>
    </>
  );
}
