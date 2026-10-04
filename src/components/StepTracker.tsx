import { th } from '@/i18n/th';
import { cx } from './ui';

/** แถบความคืบหน้า 7 ขั้น (กะทัดรัด สำหรับตาราง) — มีข้อความบอกขั้นเสมอ ไม่ใช้สีอย่างเดียว */
export function StepBar({ step, muted }: { step: number; muted?: boolean }) {
  const names = th.dashboard.improveSteps;
  return (
    <span className="flex flex-col gap-1">
      <span aria-hidden="true" className="flex gap-0.5">
        {names.map((_, i) => <span key={i} className={cx('h-1.5 w-5 rounded-sm', i < step ? (muted ? 'bg-neutral' : 'bg-accent') : 'bg-border')} />)}
      </span>
      <span className="text-xs text-muted">{th.improvement.stepOf(step, names[step - 1])}</span>
    </span>
  );
}

/** ตัวติดตามขั้นแบบเต็ม (หน้ารายละเอียด) — ขั้นปัจจุบันมี aria-current="step" */
export function StepTracker({ step, done }: { step: number; done?: boolean }) {
  const names = th.dashboard.improveSteps;
  return (
    <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-7" aria-label={th.improvement.trackerTitle}>
      {names.map((n, i) => {
        const no = i + 1;
        const passed = no < step || (done && no === step);
        const current = no === step && !done;
        return (
          <li key={n} aria-current={current ? 'step' : undefined}
            className={cx('flex min-h-11 items-start gap-2 rounded-control border px-2.5 py-2 text-xs', current ? 'border-accent bg-accent-tint font-semibold text-accent-hover' : passed ? 'border-ok bg-ok-tint text-ok-fg' : 'border-border bg-surface text-muted')}>
            <span className="font-mono font-bold">{passed ? '✓' : no}</span>
            <span>{n}</span>
          </li>
        );
      })}
    </ol>
  );
}
