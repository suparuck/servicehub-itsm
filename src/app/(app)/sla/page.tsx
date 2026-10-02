import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, KpiTile, PriorityChip, StatusBadge, cx } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { formatDocNo } from '@/lib/docno';
import { formatRemaining } from '@/lib/datetime';
import { PERIODS, getSlaReport, parsePeriod } from '@/lib/slaReport';
import { SLA_TARGET_PCT, formatDuration, meetsTarget } from '@/lib/slaStats';

export const dynamic = 'force-dynamic';
const mono = 'font-mono';

export default async function SlaPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = parsePeriod((await searchParams).days);
  const t = th.slaReport;
  const [user, r] = await Promise.all([getCurrentUser(), getSlaReport(days)]);
  const pctText = (p: number | null) => (p === null ? '—' : `${p}%`);

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t.period} className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => (
              <Link key={p} href={`/sla?days=${p}`} aria-current={p === days ? 'page' : undefined}
                className={cx('inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm no-underline', p === days ? 'border-ink bg-ink text-white hover:text-white' : 'border-input bg-surface text-ink hover:text-ink')}>
                {t.periodOption(p)}
              </Link>
            ))}
          </nav>
          <span className="text-xs text-muted">{t.note(days)}</span>
        </div>

        <section aria-label={t.title} className="grid grid-cols-2 gap-3 xs:grid-cols-3 lg:grid-cols-5">
          <KpiTile label={t.kpi.resolve} value={pctText(r.resolve.pct)} note={r.resolve.total ? t.kpiNote.samples(r.resolve.total) : t.kpiNote.none} good={meetsTarget(r.resolve.pct)} practice={t.kpiNote.target} />
          <KpiTile label={t.kpi.response} value={pctText(r.response.pct)} note={r.response.total ? t.kpiNote.samples(r.response.total) : t.kpiNote.none} good={meetsTarget(r.response.pct)} practice={t.kpiNote.target} />
          <KpiTile label={t.kpi.mttr} value={formatDuration(r.mttrMin)} note={t.kpiNote.samples(r.mttrByPriority.reduce((n, x) => n + x.count, 0))} good />
          <KpiTile label={t.kpi.breaches} value={String(r.resolve.breached + r.response.breached)} note={`${t.metric.RESOLVE} ${r.resolve.breached} · ${t.metric.RESPONSE} ${r.response.breached}`} good={r.resolve.breached + r.response.breached === 0} />
          <KpiTile label={t.kpi.atRisk} value={String(r.atRisk.length)} note={r.atRisk.filter((x) => x.overdue).length ? `${t.overdue} ${r.atRisk.filter((x) => x.overdue).length}` : ' '} good={r.atRisk.length === 0} />
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card>
            <h2 className="m-0 text-[17px] font-semibold">{t.byService}</h2>
            {r.byService.length === 0 && <p className="m-0 text-sm text-muted">{t.noData}</p>}
            {r.byService.map((s) => (
              <div key={s.group} className="flex flex-col gap-1.5 border-t border-divider pt-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{s.group}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted">{t.colMet} {s.met}/{s.total}</span>
                    <StatusBadge tone={meetsTarget(s.pct) ? 'ok' : 'warn'}>{meetsTarget(s.pct) ? t.onTarget : t.belowTarget}</StatusBadge>
                    <span className={cx(mono, 'w-14 text-right font-semibold')}>{pctText(s.pct)}</span>
                  </span>
                </div>
                <div className="relative h-2.5 rounded-[5px] bg-divider">
                  <div className={cx('absolute inset-y-0 left-0 rounded-[5px]', meetsTarget(s.pct) ? 'bg-accent' : 'bg-warn')} style={{ width: `${s.pct ?? 0}%` }} />
                  <div role="img" aria-label={t.targetAria} className="absolute -bottom-[3px] -top-[3px] border-l-2 border-dashed border-ink" style={{ left: `${SLA_TARGET_PCT}%` }} />
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <h2 className="m-0 text-[17px] font-semibold">{t.byPriority}</h2>
            <div role="table" className="flex flex-col text-sm">
              <div role="row" className="grid grid-cols-[minmax(0,1fr)_40px_40px_56px] md:grid-cols-[1fr_52px_52px_72px_72px] gap-2 border-b border-border pb-2 text-xs text-muted">
                <span role="columnheader">{t.colPriority}</span><span role="columnheader">{t.colMet}</span><span role="columnheader">{t.colBreached}</span><span role="columnheader">{t.colPct}</span><span role="columnheader" className="hidden md:block">{t.colMttr}</span>
              </div>
              {(['P1', 'P2', 'P3', 'P4'] as const).map((p) => {
                const s = r.byPriority.find((x) => x.group === p);
                const m = r.mttrByPriority.find((x) => x.priority === p);
                return (
                  <div key={p} role="row" className="grid min-h-[44px] grid-cols-[minmax(0,1fr)_40px_40px_56px] md:grid-cols-[1fr_52px_52px_72px_72px] items-center gap-2 border-b border-divider">
                    <PriorityChip priority={p} />
                    <span className={mono}>{s?.met ?? 0}</span>
                    <span className={cx(mono, !!s?.breached && 'font-semibold text-critical-fg')}>{s?.breached ?? 0}</span>
                    <span className={cx(mono, 'font-semibold')}>{pctText(s?.pct ?? null)}</span>
                    <span className={cx(mono, 'hidden md:block')}>{formatDuration(m?.min ?? null)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="m-0 text-[17px] font-semibold">{t.atRiskTitle}</h2>
            {r.atRisk.length === 0 && <p className="m-0 text-sm text-muted">{t.atRiskNone}</p>}
            {r.atRisk.map((x) => (
              <Link key={x.incidentId} href={`/incidents/${formatDocNo('INC', x.seq)}`} className="flex min-h-[44px] items-center justify-between gap-3 border-t border-divider py-2 text-ink no-underline hover:text-ink">
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-xs text-muted"><span className={mono}>{formatDocNo('INC', x.seq)}</span><PriorityChip priority={x.priority} className="px-2 py-0 text-[11px]" /></span>
                  <span className="text-sm font-medium">{x.title}</span>
                  <span className="text-xs text-muted">{x.service}</span>
                </span>
                <span className={cx('whitespace-nowrap text-xs font-semibold', x.overdue ? 'text-critical-fg' : 'text-warn-fg')}>{x.overdue ? t.overdue : t.left(formatRemaining(x.leftMin))}</span>
              </Link>
            ))}
          </Card>

          <Card>
            <h2 className="m-0 text-[17px] font-semibold">{t.breachesTitle}</h2>
            {r.breaches.length === 0 && <p className="m-0 text-sm text-muted">{t.breachesNone}</p>}
            {r.breaches.map((x, i) => (
              <Link key={`${x.incidentId}${i}`} href={`/incidents/${formatDocNo('INC', x.seq)}`} className="flex min-h-[44px] items-center justify-between gap-3 border-t border-divider py-2 text-ink no-underline hover:text-ink">
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-xs text-muted"><span className={mono}>{formatDocNo('INC', x.seq)}</span><PriorityChip priority={x.priority} className="px-2 py-0 text-[11px]" /><span>{t.metric[x.metric]}</span></span>
                  <span className="text-sm font-medium">{x.title}</span>
                  <span className="text-xs text-muted">{x.service}</span>
                </span>
                <span className="whitespace-nowrap text-xs font-semibold text-critical-fg">{t.overrun(x.overrunMin)}</span>
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
