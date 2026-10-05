import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, StatusBadge, cx, type Column, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateShort, thTime } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import type { EvStatus, Severity } from '@/lib/monitoring';
import { affectedCis, eventsOverview, listEvents, listSources } from '@/lib/monitoringService';
import { can, type Role } from '@/lib/permissions';
import { ackEventAction, makeIncidentAction, resolveEventAction } from './actions';

export const dynamic = 'force-dynamic';
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';
const btn = 'h-11 rounded-control border border-input bg-surface px-3 text-sm';
const SEV_TONE: Record<Severity, Tone> = { INFO: 'neutral', WARNING: 'warn', CRITICAL: 'critical' };
const STATUS_TONE: Record<EvStatus, Tone> = { OPEN: 'accent', ACKNOWLEDGED: 'neutral', RESOLVED: 'ok' };
type SP = { q?: string; status?: string; severity?: string; source?: string; error?: string };

export default async function MonitoringPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = th.monitoring;
  const user = await getCurrentUser();
  const role = user.role as Role;
  const handle = can(role, 'incident.manage');
  const [rows, sum, cis, sources] = await Promise.all([listEvents(sp), eventsOverview(), affectedCis(), listSources()]);
  type Row = (typeof rows)[number];

  const tiles: { key: keyof typeof t.tiles; n: number; href: string; tone?: Tone }[] = [
    { key: 'critical', n: sum.critical, href: '/monitoring?severity=CRITICAL', tone: 'critical' },
    { key: 'warning', n: sum.warning, href: '/monitoring?severity=WARNING', tone: 'warn' },
    { key: 'info', n: sum.info, href: '/monitoring?severity=INFO' },
    { key: 'acknowledged', n: sum.acknowledged, href: '/monitoring?status=ACKNOWLEDGED' },
    { key: 'last24h', n: sum.last24h, href: '/monitoring?status=all' },
  ];

  const columns: Column<Row>[] = [
    { key: 'sev', header: t.colSeverity, render: (r) => <StatusBadge tone={SEV_TONE[r.severity]} className="text-xs">{t.severity[r.severity]}</StatusBadge> },
    {
      key: 'event', header: t.colEvent,
      render: (r) => (
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{r.check}</span>
          {r.message && <span className="line-clamp-2 text-xs text-muted">{r.message}</span>}
          <span className="text-xs text-muted">{t.times(r.occurrences)}{r.ackedBy ? ` · ${t.ackedBy(r.ackedBy.name)}` : ''}</span>
        </span>
      ),
    },
    {
      key: 'ci', header: t.colCi, hideOnSmall: true,
      render: (r) => (r.ci ? <Link href={`/cmdb/${r.ci.ciId}`} className="inline-flex min-h-11 items-center text-[13px]">{r.ci.name}</Link> : r.ciRef ? <span className="flex flex-col text-[13px]">{r.ciRef}<span className="text-xs text-muted">{t.ciUnknown}</span></span> : <span className="text-[13px] text-muted">{t.noCi}</span>),
    },
    { key: 'source', header: t.colSource, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.source.name}</span> },
    { key: 'seen', header: t.colSeen, hideOnSmall: true, render: (r) => <span className="text-[13px]">{thDateShort(r.lastSeenAt)} {thTime(r.lastSeenAt)}</span> },
    { key: 'status', header: t.colStatus, render: (r) => <StatusBadge tone={STATUS_TONE[r.status]} className="text-xs">{t.status[r.status]}</StatusBadge> },
    {
      key: 'action', header: t.colAction,
      render: (r) => {
        if (r.status === 'RESOLVED') return r.incident ? <Link href={`/incidents/${formatDocNo('INC', r.incident.seq)}`} className="inline-flex min-h-11 items-center font-mono text-[12px]">{formatDocNo('INC', r.incident.seq)}</Link> : <span className="text-xs text-muted">—</span>;
        return (
          <span className="flex flex-col items-stretch gap-1.5 md:flex-row md:flex-wrap md:items-center">
            {r.incident ? (
              <Link href={`/incidents/${formatDocNo('INC', r.incident.seq)}`} className="inline-flex min-h-11 items-center font-mono text-[12px]">{formatDocNo('INC', r.incident.seq)}</Link>
            ) : r.incidentRequestedAt ? (
              <span className="text-xs text-muted">{t.incidentLinked}</span>
            ) : (
              handle && <form action={makeIncidentAction.bind(null, r.id)}><button type="submit" aria-label={`${t.makeIncident}: ${r.check}`} className={cx(btn, 'font-semibold')}>{t.makeIncident}</button></form>
            )}
            {handle && r.status === 'OPEN' && <form action={ackEventAction.bind(null, r.id)}><button type="submit" aria-label={`${t.ack}: ${r.check}`} className={btn}>{t.ack}</button></form>}
            {handle && <form action={resolveEventAction.bind(null, r.id)}><button type="submit" aria-label={`${t.close}: ${r.check}`} className={btn}>{t.close}</button></form>}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-5" aria-label="สรุป" data-testid="tiles">
          {tiles.map((x) => (
            <li key={x.key}>
              <Link href={x.href} className="flex min-h-[78px] flex-col gap-1 rounded-card border border-border bg-surface p-3.5 text-ink no-underline hover:border-accent hover:text-ink">
                <span className="text-xs text-muted">{t.tiles[x.key]}</span>
                <span className={`font-mono text-2xl font-semibold ${x.n > 0 && x.tone === 'critical' ? 'text-critical-fg' : x.n > 0 && x.tone === 'warn' ? 'text-warn-fg' : ''}`}>{x.n}</span>
              </Link>
            </li>
          ))}
        </ul>

        <Card className="gap-2">
          <h2 className="m-0 text-[15px] font-semibold">{t.ciTitle}</h2>
          {cis.length === 0 ? <p className="m-0 text-sm text-muted">{t.ciNone}</p> : (
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2 lg:grid-cols-3" data-testid="ci-health">
              {cis.map((c) => (
                <li key={c.id}>
                  <Link href={`/cmdb/${c.ciId}`} className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-subtle px-3 py-2 text-sm text-ink no-underline hover:border-accent hover:text-ink">
                    <StatusBadge tone={c.health === 'CRITICAL' ? 'critical' : 'warn'} className="text-xs">{t.ciHealth[c.health]}</StatusBadge>
                    <span className="min-w-0 grow truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted">{t.ciEvents(c.events)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {can(role, 'monitoring.admin') && <Link href="/monitoring/sources" className="inline-flex min-h-11 items-center text-sm">{t.sourcesLink}</Link>}
        </div>

        <form method="get" action="/monitoring" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{th.common.search}
            <input type="search" name="q" defaultValue={sp.q} placeholder={t.searchPlaceholder} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterStatus}
            <select name="status" defaultValue={sp.status ?? ''} className={control}>
              <option value="">{t.statusActive}</option>
              <option value="all">{t.statusAll}</option>
              {(Object.keys(t.status) as EvStatus[]).map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterSeverity}
            <select name="severity" defaultValue={sp.severity ?? ''} className={control}>
              <option value="">{t.allSeverities}</option>
              {(Object.keys(t.severity) as Severity[]).map((s) => <option key={s} value={s}>{t.severity[s]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterSource}
            <select name="source" defaultValue={sp.source ?? ''} className={control}>
              <option value="">{t.allSources}</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.apply}</button>
          <Link href="/monitoring" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
        </form>

        <Card>
          <span className="text-sm text-muted" aria-live="polite">{t.total(rows.length)}</span>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={t.empty} gridClass="grid-cols-[84px_minmax(0,1fr)_104px] md:grid-cols-[90px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_130px_110px_minmax(0,1.6fr)]" />
        </Card>
      </div>
    </>
  );
}
