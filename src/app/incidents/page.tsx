import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, PriorityChip, SlaBar, StatusBadge, type Column } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { formatRemaining } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { ALL_STATUSES } from '@/lib/incident';
import { listIncidents } from '@/lib/incidentQueries';
import { timerView } from '@/lib/sla';

export const dynamic = 'force-dynamic';
type SP = { q?: string; status?: string; priority?: string; group?: string; page?: string };

const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = th.incident;
  const [user, groups, res] = await Promise.all([
    getCurrentUser(),
    db.assignmentGroup.findMany({ orderBy: { name: 'asc' } }),
    listIncidents({ q: sp.q, status: sp.status, priority: sp.priority, group: sp.group, page: Number(sp.page) || 1 }),
  ]);
  const now = new Date();
  type Row = (typeof res.rows)[number];

  const href = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, status: sp.status, priority: sp.priority, group: sp.group })) if (v) p.set(k, v);
    p.set('page', String(page));
    return `/incidents?${p}`;
  };

  const columns: Column<Row>[] = [
    {
      key: 'id', header: th.dashboard.colId,
      render: (r) => (
        <Link href={`/incidents/${formatDocNo('INC', r.seq)}`} className="inline-flex min-h-[44px] items-center font-mono text-[13px]">
          {formatDocNo('INC', r.seq)}
        </Link>
      ),
    },
    {
      key: 'title', header: th.dashboard.colTitle,
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{r.title}</span>
          <span className="text-xs text-muted">
            {r.service?.fullName ?? r.service?.name}
            {r.isMajor ? ` · ${th.dashboard.majorIncident}` : ''}
            {r.assignee ? ` · ${r.assignee.name}` : ` · ${t.unassigned}`}
          </span>
        </span>
      ),
    },
    { key: 'group', header: th.dashboard.colGroup, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.group?.name}</span> },
    { key: 'p', header: th.dashboard.colPriority, render: (r) => <PriorityChip priority={r.priority} /> },
    { key: 'status', header: th.dashboard.colStatus, hideOnSmall: true, render: (r) => <span className="text-[13px]">{th.incidentStatus[r.status]}</span> },
    {
      key: 'sla', header: th.dashboard.colSla, hideOnSmall: true,
      render: (r) => {
        const tm = r.timers[0];
        if (!tm) return '—';
        const v = timerView(tm, now);
        if (v.state === 'MET' || r.status === 'RESOLVED' || r.status === 'CLOSED') return <StatusBadge tone="ok">{t.slaState.MET}</StatusBadge>;
        if (v.state === 'BREACHED') return <StatusBadge tone="critical">{t.slaState.BREACHED}</StatusBadge>;
        return <SlaBar label={formatRemaining(v.leftMs / 60_000)} pct={v.pct} />;
      },
    },
  ];

  return (
    <>
      <PageHeader breadcrumb={t.listBreadcrumb} title={t.listTitle} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <form method="get" action="/incidents" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">
            {t.search}
            <input type="search" name="q" defaultValue={sp.q} className={control} placeholder="INC-24817 หรือ ERP" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t.filterStatus}
            <select name="status" defaultValue={sp.status ?? 'open'} className={control}>
              <option value="open">{t.statusOpen}</option>
              <option value="all">{t.statusAll}</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{th.incidentStatus[s]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t.filterPriority}
            <select name="priority" defaultValue={sp.priority ?? ''} className={control}>
              <option value="">{t.allPriorities}</option>
              {(['P1', 'P2', 'P3', 'P4'] as const).map((p) => <option key={p} value={p}>{th.priority[p]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t.filterGroup}
            <select name="group" defaultValue={sp.group ?? ''} className={control}>
              <option value="">{t.allGroups}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.apply}</button>
          <Link href="/incidents" className="inline-flex h-11 items-center px-2 text-sm">{t.reset}</Link>
        </form>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted" aria-live="polite">{t.total(res.total)}</span>
            <Link href="/incidents/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">
              {th.header.newIncident}
            </Link>
          </div>
          <DataTable columns={columns} rows={res.rows} rowKey={(r) => r.id} empty={th.dashboard.queueEmpty} gridClass="grid-cols-trow-s md:grid-cols-trow" />
          {res.pages > 1 && (
            <nav aria-label="หน้า" className="flex items-center justify-between gap-3 pt-2 text-sm">
              {res.page > 1 ? <Link href={href(res.page - 1)} className="inline-flex min-h-[44px] items-center">{t.prev}</Link> : <span />}
              <span className="text-muted">{t.page(res.page, res.pages)}</span>
              {res.page < res.pages ? <Link href={href(res.page + 1)} className="inline-flex min-h-[44px] items-center">{t.next}</Link> : <span />}
            </nav>
          )}
        </Card>
      </div>
    </>
  );
}
