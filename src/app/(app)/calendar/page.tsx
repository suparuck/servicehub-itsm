import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge, cx, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { buildEvents, groupByDay, parseShow, type CalendarEvent } from '@/lib/calendar';
import { bangkokYmd, buildMonthGrid, parseMonthParam, shiftMonth } from '@/lib/change';
import { getCurrentUser } from '@/lib/currentUser';
import { loadCalendarRows } from '@/lib/calendarQueries';
import { thDay, thMonthShort, thWindow } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

const TAG_TONE: Record<CalendarEvent['tag'], Tone> = {
  STANDARD: 'ok', NORMAL: 'accent', EMERGENCY: 'critical', PROBLEM_DUE: 'warn', PROBLEM_OVERDUE: 'critical', PROBLEM_RESOLVED: 'neutral',
};
const CHIP: Record<CalendarEvent['tag'], string> = {
  STANDARD: 'bg-ok-tint text-ok-fg', NORMAL: 'bg-accent-tint text-accent-hover', EMERGENCY: 'bg-critical-tint text-critical-fg',
  PROBLEM_DUE: 'bg-warn-tint text-warn-fg', PROBLEM_OVERDUE: 'bg-critical-tint text-critical-fg', PROBLEM_RESOLVED: 'bg-neutral-tint text-neutral',
};
const when = (e: CalendarEvent) => (e.kind === 'CHANGE' ? `${thDay(e.start)} ${thMonthShort(e.start)} · ${thWindow(e.start, e.end)}` : `${thDay(e.start)} ${thMonthShort(e.start)}`);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; show?: string }> }) {
  const sp = await searchParams;
  const t = th.calendar;
  const tc = th.change;
  const user = await getCurrentUser();
  const { year, month } = parseMonthParam(sp.month);
  const show = parseShow(sp.show);
  const grid = buildMonthGrid(year, month);
  const first = new Date(`${grid[0][0].ymd}T00:00:00+07:00`);
  const last = new Date(new Date(`${grid[grid.length - 1][6].ymd}T00:00:00+07:00`).getTime() + 86_400_000);

  const rows = await loadCalendarRows(first, last, show);
  const events = buildEvents(rows.changes, rows.problems);
  const byDay = groupByDay(events);
  const today = bangkokYmd(new Date());
  const showParam = show.change && show.problem ? '' : `&show=${show.change ? 'change' : 'problem'}`;
  const mp = (m: { year: number; month: number }) => `/calendar?month=${m.year}-${String(m.month).padStart(2, '0')}${showParam}`;
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const inMonth = events.filter((e) => {
    const ymd = bangkokYmd(e.start);
    return ymd.startsWith(`${year}-${String(month).padStart(2, '0')}`);
  });

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <form method="get" action="/calendar" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-border bg-surface p-4">
          <input type="hidden" name="month" value={`${year}-${String(month).padStart(2, '0')}`} />
          <fieldset className="m-0 flex flex-wrap items-center gap-x-5 border-0 p-0">
            <legend className="sr-only">{t.filterTitle}</legend>
            <span className="text-sm text-muted" aria-hidden="true">{t.filterTitle}</span>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="show" value="change" defaultChecked={show.change} className="h-4 w-4" />{t.showChange}</label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="show" value="problem" defaultChecked={show.problem} className="h-4 w-4" />{t.showProblem}</label>
          </fieldset>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.apply}</button>
          <span className="grow" />
          <a href="/calendar/export" download className="inline-flex min-h-11 items-center text-sm" aria-describedby="ics-hint">{t.export}</a>
          <span id="ics-hint" className="sr-only">{t.exportHint}</span>
        </form>

        <Card className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={mp(prev)} className="inline-flex min-h-[44px] items-center text-sm">{tc.prevMonth}</Link>
            <h2 className="m-0 text-[17px] font-semibold" aria-live="polite">{tc.months[month - 1]} {year + 543}</h2>
            <div className="flex items-center gap-3">
              <Link href={`/calendar${showParam ? `?${showParam.slice(1)}` : ''}`} className="inline-flex min-h-[44px] items-center text-sm">{tc.today}</Link>
              <Link href={mp(next)} className="inline-flex min-h-[44px] items-center text-sm">{tc.nextMonth}</Link>
            </div>
          </div>
          <div role="grid" aria-label={t.aria} className="grid grid-cols-7 gap-px overflow-hidden rounded-control border border-border bg-border">
            {tc.weekdays.map((w) => <div key={w} role="columnheader" className="bg-subtle px-1 py-2 text-center text-xs font-semibold text-muted">{w}</div>)}
            {grid.flat().map((c) => {
              const items = byDay.get(c.ymd) ?? [];
              return (
                <div key={c.ymd} role="gridcell" className={cx('flex min-h-[84px] flex-col gap-1 bg-surface p-1 md:min-h-[110px] md:p-1.5', !c.inMonth && 'bg-subtle text-muted')}>
                  <span className={cx('font-mono text-xs', c.ymd === today && 'inline-flex h-6 w-6 items-center justify-center self-start rounded-full bg-accent font-bold text-white')}>{c.day}</span>
                  {items.map((e) => (
                    <Link key={e.key} href={e.href} title={`${e.docNo} ${e.title} · ${t.tag[e.tag]}${e.conflictWith.length ? ` · ${t.conflict} ${e.conflictWith.join(', ')}` : ''}`}
                      className={cx('block overflow-hidden rounded px-1 py-1 text-[11px] leading-tight no-underline', CHIP[e.tag], e.status === 'CANCELLED' && 'line-through opacity-60', e.conflictWith.length > 0 && 'ring-2 ring-critical')}>
                      <span className="font-mono">{e.kind === 'CHANGE' ? thWindow(e.start, null) : e.docNo}</span>{' '}
                      <span className="hidden md:inline">{e.kind === 'CHANGE' ? e.title : ''}</span>
                      <span className="md:hidden">{e.kind === 'CHANGE' ? e.docNo : ''}</span>
                      {e.conflictWith.length > 0 && <span aria-hidden="true"> ⚠</span>}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
          <ul className="m-0 flex list-none flex-wrap items-center gap-3 p-0 text-xs" aria-label={t.legendTitle}>
            {(Object.keys(t.tag) as CalendarEvent['tag'][]).map((k) => <li key={k}><StatusBadge tone={TAG_TONE[k]}>{t.tag[k]}</StatusBadge></li>)}
            <li className="text-muted">⚠ = {t.conflict} Change อื่น</li>
          </ul>
        </Card>

        <Card className="gap-2">
          <h2 className="m-0 text-[17px] font-semibold">{t.agendaTitle}</h2>
          {inMonth.length === 0 ? (
            <p className="m-0 text-sm text-muted">{t.empty}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0" data-testid="agenda">
              {inMonth.map((e) => (
                <li key={e.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider py-2.5 last:border-b-0">
                  <span className="w-[130px] shrink-0 font-mono text-[13px] text-muted">{when(e)}</span>
                  <Link href={e.href} className="inline-flex min-h-11 items-center font-mono text-[13px]">{e.docNo}</Link>
                  <span className="min-w-0 grow basis-[200px] text-sm font-medium">{e.title}</span>
                  <StatusBadge tone={TAG_TONE[e.tag]}>{t.tag[e.tag]}</StatusBadge>
                  {e.conflictWith.length > 0 && <StatusBadge tone="critical">{t.conflict} {e.conflictWith.join(', ')}</StatusBadge>}
                  {e.overdue && <StatusBadge tone="critical">{t.overdue}</StatusBadge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
