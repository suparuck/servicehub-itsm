import { th } from '@/i18n/th';
import { bangkokYmd } from '@/lib/change';

const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';

export interface ImpDefaults {
  title?: string;
  description?: string | null;
  baseline?: string | null;
  goal?: string | null;
  result?: string | null;
  benefit?: string;
  ownerId?: string | null;
  targetDate?: Date | null;
  problemId?: string | null;
  serviceId?: string | null;
}

/** ฟิลด์ฟอร์มของรายการปรับปรุง (ใช้ทั้งหน้าเสนอใหม่และหน้าแก้ไข) */
export function ImpFormFields({ d, options }: { d: ImpDefaults; options: { owners: { id: string; name: string }[]; problems: { id: string; seq: number; title: string }[]; services: { id: string; code: string; name: string }[] } }) {
  const f = th.improvement.form;
  const area = `${field} py-3`;
  return (
    <>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.title} <span aria-hidden="true" className="text-critical">*</span>
        <input name="title" required maxLength={200} defaultValue={d.title ?? ''} className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.description}
        <textarea name="description" rows={3} maxLength={2000} defaultValue={d.description ?? ''} aria-describedby="h-desc" className={area} />
        <span id="h-desc" className="text-xs font-normal text-muted">{f.descriptionHint}</span>
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.baseline}
          <textarea name="baseline" rows={3} maxLength={2000} defaultValue={d.baseline ?? ''} aria-describedby="h-base" className={area} />
          <span id="h-base" className="text-xs font-normal text-muted">{f.baselineHint}</span>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.goal}
          <textarea name="goal" rows={3} maxLength={2000} defaultValue={d.goal ?? ''} aria-describedby="h-goal" className={area} />
          <span id="h-goal" className="text-xs font-normal text-muted">{f.goalHint}</span>
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.result}
        <textarea name="result" rows={2} maxLength={2000} defaultValue={d.result ?? ''} aria-describedby="h-res" className={area} />
        <span id="h-res" className="text-xs font-normal text-muted">{f.resultHint}</span>
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.benefit}
          <select name="benefit" defaultValue={d.benefit ?? 'MED'} className={field}>
            {(['HIGH', 'MED', 'LOW'] as const).map((b) => <option key={b} value={b}>{th.improvement.benefit[b]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.owner}
          <select name="ownerId" defaultValue={d.ownerId ?? ''} className={field}>
            <option value="">{f.none}</option>
            {options.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.target}
          <input name="targetDate" type="date" defaultValue={d.targetDate ? bangkokYmd(d.targetDate) : ''} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.problem}
          <select name="problemId" defaultValue={d.problemId ?? ''} className={field}>
            <option value="">{f.none}</option>
            {options.problems.map((p) => <option key={p.id} value={p.id}>PRB-{String(p.seq).padStart(4, '0')} · {p.title}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.service}
          <select name="serviceId" defaultValue={d.serviceId ?? ''} className={field}>
            <option value="">{f.none}</option>
            {options.services.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
        </label>
      </div>
    </>
  );
}
