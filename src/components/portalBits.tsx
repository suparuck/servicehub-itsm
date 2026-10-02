import Link from 'next/link';
import type { ReactNode } from 'react';
import { th } from '@/i18n/th';
import type { MineItem } from '@/lib/portalService';
import { cx } from './ui';

export const portalField = 'box-border min-h-11 w-full rounded-control border border-input bg-surface px-3 text-sm';
export const portalLabel = 'text-[13px] font-medium text-ink';

/** กรอบเนื้อหาพอร์ทัล (ความกว้างสูงสุด 1120px) */
export function PortalPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto box-border flex w-full max-w-[1120px] flex-col gap-6 px-8 pb-12 pt-8', className)}>{children}</div>;
}

export function ProgressBars({ n, total = 4 }: { n: number; total?: number }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx('h-1.5 rounded-[3px]', i < n ? 'bg-accent' : 'bg-border')} />
      ))}
    </div>
  );
}

export function MineCard({ item }: { item: MineItem }) {
  return (
    <Link
      href={`/portal/my/${item.docNo}`}
      className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4 text-ink no-underline hover:border-accent hover:text-ink"
    >
      <div className="flex justify-between gap-2">
        <span className="font-mono text-xs text-muted">{item.docNo}</span>
        <span className="text-xs font-semibold">{item.state}</span>
      </div>
      <span className="text-[15px] font-semibold">{item.title}</span>
      <div role="progressbar" aria-label={th.portal.detail.progress} aria-valuemin={0} aria-valuemax={item.steps.length} aria-valuenow={item.bars} aria-valuetext={`${item.steps[Math.max(0, item.bars - 1)]} (${item.bars}/${item.steps.length})`}>
        <ProgressBars n={item.bars} total={item.steps.length} />
      </div>
      <span className="text-xs text-muted">{item.next}</span>
    </Link>
  );
}

/** แบบประเมิน CSAT 1–5 (ปุ่มส่งฟอร์ม — ใช้ได้โดยไม่ต้องมี JS) */
export function SurveyForm({ action, comment = true }: { action: (fd: FormData) => Promise<void>; comment?: boolean }) {
  const p = th.portal;
  return (
    <form action={action} className="flex flex-col gap-2.5">
      {comment && (
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          {p.rateComment}
          <input name="comment" maxLength={500} className={portalField} />
        </label>
      )}
      <div role="group" aria-label={p.rateAria} className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="submit" name="score" value={n} aria-label={p.rateScore(n)} className="h-11 w-11 rounded-control border border-input bg-surface font-semibold hover:border-accent hover:bg-accent-tint">
            {n}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted">{p.rateHelp}</span>
    </form>
  );
}
