import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { StepBar } from '@/components/StepTracker';
import { Card, DataTable, StatusBadge, type Column, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateShort } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { improvementSummary, listImprovements } from '@/lib/improvementService';
import type { ImpStatus } from '@/lib/improvement';
import { can, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';
const STATUS_TONE: Record<ImpStatus, Tone> = { OPEN: 'accent', ON_HOLD: 'warn', DONE: 'ok', CANCELLED: 'neutral' };
type SP = { q?: string; status?: string; step?: string; mine?: string; overdue?: string };

export default async function ImprovementPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = th.improvement;
  const user = await getCurrentUser();
  const filters = { ...sp, mine: sp.mine === '1' ? user.id : undefined };
  const [rows, sum] = await Promise.all([listImprovements(filters), improvementSummary()]);
  type Row = (typeof rows)[number];

  const tiles: { key: keyof typeof t.tiles; n: number; href: string; tone?: Tone }[] = [
    { key: 'open', n: sum.open, href: '/improvement?status=OPEN' },
    { key: 'onHold', n: sum.onHold, href: '/improvement?status=ON_HOLD', tone: 'warn' },
    { key: 'done', n: sum.done, href: '/improvement?status=DONE' },
    { key: 'overdue', n: sum.overdue, href: '/improvement?overdue=1', tone: 'critical' },
  ];

  const columns: Column<Row>[] = [
    { key: 'id', header: t.colId, render: (r) => <Link href={`/improvement/${formatDocNo('IMP', r.seq)}`} className="inline-flex min-h-[44px] items-center font-mono text-[13px]">{formatDocNo('IMP', r.seq)}</Link> },
    { key: 'title', header: t.colTitle, render: (r) => <span className="flex flex-col"><span className="font-medium">{r.title}</span><span className="text-xs text-muted">{th.improvement.benefit[r.benefit]}</span></span> },
    { key: 'owner', header: t.colOwner, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.owner?.name ?? <span className="text-muted">{t.noOwner}</span>}</span> },
    { key: 'step', header: t.colStep, hideOnSmall: true, render: (r) => <StepBar step={r.step} muted={r.status !== 'OPEN'} /> },
    { key: 'target', header: t.colTarget, hideOnSmall: true, render: (r) => <span className="flex flex-col text-[13px]">{r.targetDate ? thDateShort(r.targetDate) : '—'}{r.overdue && <StatusBadge tone="critical" className="mt-0.5 self-start text-xs">{t.overdue}</StatusBadge>}</span> },
    { key: 'st', header: t.colStatus, render: (r) => <StatusBadge tone={STATUS_TONE[r.status]} className="text-xs">{t.status[r.status]}</StatusBadge> },
  ];

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4" aria-label="สรุป" data-testid="tiles">
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
          <h2 className="m-0 text-[15px] font-semibold">{t.byStepTitle}</h2>
          <ol className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-4 lg:grid-cols-7" data-testid="by-step">
            {th.dashboard.improveSteps.map((name, i) => (
              <li key={name}>
                <Link href={`/improvement?status=OPEN&step=${i + 1}`} className="flex min-h-11 flex-col rounded-control border border-border bg-subtle px-2.5 py-2 text-xs text-ink no-underline hover:border-accent hover:text-ink">
                  <span className="font-mono text-lg font-semibold">{sum.byStep[i]}</span>
                  <span className="text-muted">{i + 1}. {name}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {can(user.role as Role, 'improvement.manage') && (
            <Link href="/improvement/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{t.newBtn}</Link>
          )}
        </div>

        <form method="get" action="/improvement" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{th.common.search}
            <input type="search" name="q" defaultValue={sp.q} placeholder={t.searchPlaceholder} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterStatus}
            <select name="status" defaultValue={sp.status ?? ''} className={control}>
              <option value="">{t.allStatuses}</option>
              {(Object.keys(t.status) as ImpStatus[]).map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterStep}
            <select name="step" defaultValue={sp.step ?? ''} className={control}>
              <option value="">{t.allSteps}</option>
              {th.dashboard.improveSteps.map((n, i) => <option key={n} value={i + 1}>{i + 1}. {n}</option>)}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === '1'} className="h-4 w-4" />{t.mineOnly}</label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{th.common.search}</button>
          <Link href="/improvement" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
        </form>

        <Card>
          <span className="text-sm text-muted" aria-live="polite">{t.total(rows.length)}</span>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={th.dashboard.queueEmpty} gridClass="grid-cols-[96px_minmax(0,1fr)_120px] md:grid-cols-[100px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.3fr)_120px_130px]" />
        </Card>
      </div>
    </>
  );
}
