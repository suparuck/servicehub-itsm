import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, StatusBadge, type Column, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateShort, thWindow } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';
import type { RelStatus } from '@/lib/release';
import { listReleases, releaseSummary } from '@/lib/releaseService';

export const dynamic = 'force-dynamic';
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';
const TONE: Record<RelStatus, Tone> = { PLANNED: 'neutral', IN_BUILD: 'accent', READY: 'ok', DEPLOYING: 'warn', DEPLOYED: 'ok', ROLLED_BACK: 'critical', CANCELLED: 'neutral' };
type SP = { q?: string; status?: string };

export default async function ReleasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = th.release;
  const user = await getCurrentUser();
  const [rows, sum] = await Promise.all([listReleases(sp), releaseSummary()]);
  type Row = (typeof rows)[number];

  const tiles: { key: keyof typeof t.tiles; n: number; href: string; tone?: Tone }[] = [
    { key: 'planning', n: sum.planning, href: '/releases?status=active' },
    { key: 'ready', n: sum.ready, href: '/releases?status=READY' },
    { key: 'deploying', n: sum.deploying, href: '/releases?status=DEPLOYING', tone: 'warn' },
    { key: 'deployed', n: sum.deployed, href: '/releases?status=DEPLOYED' },
    { key: 'rolledBack', n: sum.rolledBack, href: '/releases?status=ROLLED_BACK', tone: 'critical' },
  ];

  const columns: Column<Row>[] = [
    { key: 'id', header: t.colId, render: (r) => <Link href={`/releases/${formatDocNo('REL', r.seq)}`} className="inline-flex min-h-[44px] items-center font-mono text-[13px]">{formatDocNo('REL', r.seq)}</Link> },
    { key: 'name', header: t.colName, render: (r) => <span className="flex flex-col"><span className="font-medium">{r.name}</span>{r.version && <span className="font-mono text-xs text-muted">{r.version}</span>}</span> },
    { key: 'owner', header: t.colOwner, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.owner?.name ?? <span className="text-muted">{t.noOwner}</span>}</span> },
    { key: 'win', header: t.colWindow, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.windowStart ? <><span className="font-mono">{thDateShort(r.windowStart)}</span> · {thWindow(r.windowStart, r.windowEnd)}</> : <span className="text-muted">{t.noWindow}</span>}</span> },
    { key: 'chg', header: t.colChanges, hideOnSmall: true, render: (r) => <span className="font-mono text-[13px]">{r._count.changes}</span> },
    { key: 'st', header: t.colStatus, render: (r) => <StatusBadge tone={TONE[r.status]} className="text-xs">{t.status[r.status]}</StatusBadge> },
  ];

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
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
        <div className="flex flex-wrap items-center justify-end gap-3">
          {can(user.role as Role, 'release.manage') && (
            <Link href="/releases/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{t.newBtn}</Link>
          )}
        </div>
        <form method="get" action="/releases" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{th.common.search}
            <input type="search" name="q" defaultValue={sp.q} placeholder={t.searchPlaceholder} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterStatus}
            <select name="status" defaultValue={sp.status ?? ''} className={control}>
              <option value="">{t.statusActive}</option>
              <option value="all">{t.statusAll}</option>
              {(Object.keys(t.status) as RelStatus[]).map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
            </select>
          </label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{th.common.search}</button>
          <Link href="/releases" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
        </form>
        <Card>
          <span className="text-sm text-muted" aria-live="polite">{t.total(rows.length)}</span>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={th.dashboard.queueEmpty} gridClass="grid-cols-[96px_minmax(0,1fr)_130px] md:grid-cols-[100px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_80px_140px]" />
        </Card>
      </div>
    </>
  );
}
