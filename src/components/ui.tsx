import type { ReactNode } from 'react';
import { th } from '@/i18n/th';
import type { Priority } from '@/lib/priority';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/** การ์ดมาตรฐาน: พื้นขาว เส้นขอบ รัศมี 10px */
export function Card({
  children,
  className,
  as: Tag = 'section',
  dark,
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div';
  dark?: boolean;
}) {
  return (
    <Tag
      className={cx(
        'flex flex-col gap-3 rounded-card p-[18px]',
        dark ? 'bg-sidebar text-[#F2F3F0]' : 'border border-border bg-surface',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({ children, sub, dark }: { children: ReactNode; sub?: ReactNode; dark?: boolean }) {
  return (
    <>
      <h2 className="m-0 text-[17px] font-semibold">{children}</h2>
      {sub && <span className={cx('-mt-2 text-xs', dark ? 'text-[#A9AFB9]' : 'text-muted')}>{sub}</span>}
    </>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  P1: 'bg-critical-tint text-critical-fg',
  P2: 'bg-warn-tint text-warn-fg',
  P3: 'bg-accent-tint text-accent-hover',
  P4: 'bg-neutral-tint text-neutral',
};

/** ลำดับความสำคัญ — มีข้อความกำกับเสมอ ไม่ใช้สีอย่างเดียว */
export function PriorityChip({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center self-center justify-self-start whitespace-nowrap rounded-chip px-2.5 py-[3px] text-xs font-semibold',
        PRIORITY_STYLE[priority],
        className,
      )}
    >
      {th.priority[priority]}
    </span>
  );
}

export const PRIORITY_CELL_STYLE = PRIORITY_STYLE;

export type Tone = 'ok' | 'warn' | 'critical' | 'accent' | 'neutral';
const TONE_STYLE: Record<Tone, string> = {
  ok: 'bg-ok-tint text-ok-fg',
  warn: 'bg-warn-tint text-warn-fg',
  critical: 'bg-critical-tint text-critical-fg',
  accent: 'bg-accent-tint text-accent-hover',
  neutral: 'bg-neutral-tint text-neutral',
};

export function StatusBadge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center self-start rounded-chip px-2 py-0.5 text-[11px] font-semibold',
        TONE_STYLE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** แถบ SLA คงเหลือ: ≥50% เขียว · 25–50% ส้ม · <25% แดง */
export function SlaBar({ label, pct }: { label: string; pct: number }) {
  const color = pct < 25 ? 'bg-critical' : pct < 50 ? 'bg-warn' : 'bg-ok';
  return (
    <span className="flex flex-col gap-1">
      <span className="font-mono text-xs">{label}</span>
      <span
        role="progressbar"
        aria-label="SLA คงเหลือ"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="block h-1.5 overflow-hidden rounded-[3px] bg-divider"
      >
        <span className={cx('block h-1.5 rounded-[3px]', color)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </span>
    </span>
  );
}

export type Good = boolean;
export function KpiTile({
  label,
  value,
  note,
  good,
  practice,
}: {
  label: string;
  value: string;
  note: string;
  good: Good;
  practice: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="font-mono text-[30px] font-bold leading-[1.1] tracking-[-0.02em]">{value}</span>
      <span className={cx('text-xs font-semibold', good ? 'text-ok' : 'text-warn-text')}>{note}</span>
      <span className="text-[11px] text-muted">{practice}</span>
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** ซ่อนที่หน้าจอ ≤ 860px (ตามดีไซน์) */
  hideOnSmall?: boolean;
}

/**
 * ตารางแบบ grid (ตรงกับ .trow ในดีไซน์): desktop 6 คอลัมน์, ≤860px เหลือ 3 คอลัมน์แรกที่ไม่ได้ซ่อน
 * ใช้ role="table" เพื่อให้ screen reader อ่านเป็นตาราง
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  gridClass,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  gridClass: string;
}) {
  const cell = (c: Column<T>) => cx('min-w-0', c.hideOnSmall && 'hidden md:block');
  return (
    <div role="table" className="flex flex-col">
      <div role="row" className={cx('grid items-center gap-3 border-b border-border pb-2 text-xs text-muted', gridClass)}>
        {columns.map((c) => (
          <span key={c.key} role="columnheader" className={cell(c)}>
            {c.header}
          </span>
        ))}
      </div>
      {rows.length === 0 && <div className="py-6 text-center text-sm text-muted">{empty}</div>}
      {rows.map((r) => (
        <div
          key={rowKey(r)}
          role="row"
          className={cx('grid items-center gap-3 border-b border-divider py-1.5 text-sm', gridClass)}
        >
          {columns.map((c) => (
            <div key={c.key} role="cell" className={cell(c)}>
              {c.render(r)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
