import Link from 'next/link';
import type { ChangeStatus as DbStatus, ChangeType as DbType, Prisma } from '@prisma/client';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, StatusBadge, cx, type Column, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { CLOSED_STATUSES, bangkokYmd, buildMonthGrid, parseMonthParam, shiftMonth, type ChangeStatus } from '@/lib/change';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { thWindow, thDay, thMonthShort } from '@/lib/datetime';
import { formatDocNo, parseDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
type SP = { view?: string; month?: string; q?: string; status?: string; type?: string };

const TYPE_TONE: Record<DbType, Tone> = { STANDARD: 'ok', NORMAL: 'accent', EMERGENCY: 'critical' };
const STATUS_TONE: Record<ChangeStatus, Tone> = { DRAFT: 'neutral', AWAITING_APPROVAL: 'warn', APPROVED: 'ok', SCHEDULED: 'accent', IMPLEMENTING: 'accent', COMPLETED: 'ok', FAILED: 'critical', CANCELLED: 'neutral' };
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';
const ALL_STATUS = Object.keys(th.changeStatus) as ChangeStatus[];

export default async function ChangesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = th.change;
  const calendar = sp.view === 'calendar';
  const user = await getCurrentUser();
  const canCreate = can(user?.role as Role, 'change.create');

  const where: Prisma.ChangeWhereInput = {};
  const { year, month } = parseMonthParam(sp.month);
  if (calendar) {
    // ขอบเขตเดือน (ตามเวลาไทย) ขยายให้ครอบคลุมวันนอกเดือนที่แสดงในตาราง
    const grid = buildMonthGrid(year, month);
    const first = grid[0][0].ymd;
    const last = grid[grid.length - 1][6].ymd;
    where.windowStart = { gte: new Date(`${first}T00:00:00+07:00`), lt: new Date(new Date(`${last}T00:00:00+07:00`).getTime() + 86_400_000) };
  } else {
    if (sp.status === 'all') { /* ทั้งหมด */ }
    else if (ALL_STATUS.includes(sp.status as ChangeStatus)) where.status = sp.status as DbStatus;
    else where.status = { notIn: CLOSED_STATUSES as DbStatus[] };
    if (['STANDARD', 'NORMAL', 'EMERGENCY'].includes(sp.type ?? '')) where.type = sp.type as DbType;
    const q = sp.q?.trim();
    if (q) {
      const seq = parseDocNo('CHG', q) ?? (/^\d+$/.test(q) ? Number(q) : null);
      where.OR = [{ title: { contains: q, mode: 'insensitive' } }, ...(seq !== null ? [{ seq }] : [])];
    }
  }
  const rows = await db.change.findMany({ where, orderBy: { windowStart: calendar ? 'asc' : 'desc' } });
  type Row = (typeof rows)[number];

  const tab = (view: 'list' | 'calendar', label: string) => (
    <Link href={view === 'list' ? '/changes' : '/changes?view=calendar'} aria-current={(calendar ? 'calendar' : 'list') === view ? 'page' : undefined}
      className={cx('inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm no-underline', (calendar ? 'calendar' : 'list') === view ? 'border-ink bg-ink text-white hover:text-white' : 'border-input bg-surface text-ink hover:text-ink')}>
      {label}
    </Link>
  );

  const columns: Column<Row>[] = [
    { key: 'id', header: t.colId, render: (r) => <Link href={`/changes/${formatDocNo('CHG', r.seq)}`} className="inline-flex min-h-[44px] items-center font-mono text-[13px]">{formatDocNo('CHG', r.seq)}</Link> },
    { key: 'title', header: t.colTitle, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'type', header: t.colType, hideOnSmall: true, render: (r) => <StatusBadge tone={TYPE_TONE[r.type]}>{th.changeType[r.type]}</StatusBadge> },
    { key: 'win', header: t.colWindow, hideOnSmall: true, render: (r) => <span className="text-[13px]"><span className="font-mono">{thDay(r.windowStart)} {thMonthShort(r.windowStart)}</span> · {thWindow(r.windowStart, r.windowEnd)}</span> },
    { key: 'risk', header: t.colRisk, hideOnSmall: true, render: (r) => <span className="text-[13px]">{th.risk[r.risk]}</span> },
    { key: 'st', header: t.colStatus, render: (r) => <StatusBadge tone={STATUS_TONE[r.status]} className="text-xs">{th.changeStatus[r.status]}</StatusBadge> },
  ];

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const mp = (m: { year: number; month: number }) => `/changes?view=calendar&month=${m.year}-${String(m.month).padStart(2, '0')}`;
  const today = bangkokYmd(new Date());
  const byDay = new Map<string, Row[]>();
  for (const r of rows) byDay.set(bangkokYmd(r.windowStart), [...(byDay.get(bangkokYmd(r.windowStart)) ?? []), r]);

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="มุมมอง" className="flex gap-1.5">{tab('list', t.viewList)}{tab('calendar', t.viewCalendar)}</nav>
          {canCreate && <Link href="/changes/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{t.newBtn}</Link>}
        </div>

        {!calendar ? (
          <>
            <form method="get" action="/changes" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
              <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{th.common.search}
                <input type="search" name="q" defaultValue={sp.q} placeholder={t.searchPlaceholder} className={control} />
              </label>
              <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterStatus}
                <select name="status" defaultValue={sp.status ?? ''} className={control}>
                  <option value="">{t.activeStatuses}</option>
                  <option value="all">{t.allStatuses}</option>
                  {ALL_STATUS.map((s) => <option key={s} value={s}>{th.changeStatus[s]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterType}
                <select name="type" defaultValue={sp.type ?? ''} className={control}>
                  <option value="">{t.allTypes}</option>
                  {(['STANDARD', 'NORMAL', 'EMERGENCY'] as const).map((k) => <option key={k} value={k}>{th.changeType[k]}</option>)}
                </select>
              </label>
              <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{th.common.search}</button>
              <Link href="/changes" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
            </form>
            <Card>
              <span className="text-sm text-muted" aria-live="polite">{th.common.total(rows.length)}</span>
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={th.dashboard.queueEmpty} gridClass="grid-cols-[96px_minmax(0,1fr)_120px] md:grid-cols-[100px_minmax(0,2fr)_150px_150px_100px_130px]" />
            </Card>
          </>
        ) : (
          <Card className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={mp(prev)} className="inline-flex min-h-[44px] items-center text-sm">{t.prevMonth}</Link>
              <h2 className="m-0 text-[17px] font-semibold" aria-live="polite">{t.months[month - 1]} {year + 543}</h2>
              <div className="flex items-center gap-3">
                <Link href="/changes?view=calendar" className="inline-flex min-h-[44px] items-center text-sm">{t.today}</Link>
                <Link href={mp(next)} className="inline-flex min-h-[44px] items-center text-sm">{t.nextMonth}</Link>
              </div>
            </div>
            <div role="grid" aria-label={t.calendarAria} className="grid grid-cols-7 gap-px overflow-hidden rounded-control border border-border bg-border">
              {t.weekdays.map((w) => <div key={w} role="columnheader" className="bg-subtle px-1 py-2 text-center text-xs font-semibold text-muted">{w}</div>)}
              {buildMonthGrid(year, month).flat().map((c) => {
                const items = byDay.get(c.ymd) ?? [];
                return (
                  <div key={c.ymd} role="gridcell" className={cx('flex min-h-[84px] flex-col gap-1 bg-surface p-1 md:min-h-[110px] md:p-1.5', !c.inMonth && 'bg-subtle text-muted')}>
                    <span className={cx('font-mono text-xs', c.ymd === today && 'inline-flex h-6 w-6 items-center justify-center self-start rounded-full bg-accent font-bold text-white')}>{c.day}</span>
                    {items.map((r) => (
                      <Link key={r.id} href={`/changes/${formatDocNo('CHG', r.seq)}`} title={`${r.title} · ${th.changeStatus[r.status]}`}
                        className={cx('block overflow-hidden rounded px-1 py-1 text-[11px] leading-tight no-underline', r.type === 'EMERGENCY' ? 'bg-critical-tint text-critical-fg' : r.type === 'NORMAL' ? 'bg-accent-tint text-accent-hover' : 'bg-ok-tint text-ok-fg', r.status === 'CANCELLED' && 'line-through opacity-60')}>
                        <span className="font-mono">{thWindow(r.windowStart, null)}</span> <span className="hidden md:inline">{r.title}</span><span className="md:hidden">{formatDocNo('CHG', r.seq)}</span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
            {rows.length === 0 && <p className="m-0 text-sm text-muted">{t.calendarEmpty}</p>}
            <ul className="m-0 flex list-none flex-wrap gap-3 p-0 text-xs">
              {(['STANDARD', 'NORMAL', 'EMERGENCY'] as const).map((k) => <li key={k}><StatusBadge tone={TYPE_TONE[k]}>{th.changeType[k]}</StatusBadge></li>)}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
