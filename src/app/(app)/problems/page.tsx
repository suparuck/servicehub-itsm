import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, StatusBadge, type Column, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { formatDocNo, parseDocNo } from '@/lib/docno';
import { PHASES, type ProblemPhase } from '@/lib/problem';
import { can, type Role } from '@/lib/permissions';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
const PHASE_TONE: Record<ProblemPhase, Tone> = { IDENTIFICATION: 'neutral', CONTROL: 'accent', ERROR_CONTROL: 'warn', KNOWN_ERROR: 'warn', RESOLVED: 'ok' };
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';

export default async function ProblemsPage({ searchParams }: { searchParams: Promise<{ q?: string; phase?: string }> }) {
  const sp = await searchParams;
  const t = th.problem;
  const user = await getCurrentUser();
  const where: Prisma.ProblemWhereInput = {};
  if (PHASES.includes(sp.phase as ProblemPhase)) where.phase = sp.phase as ProblemPhase;
  const q = sp.q?.trim();
  if (q) {
    const seq = parseDocNo('PRB', q) ?? (/^\d+$/.test(q) ? Number(q) : null);
    where.OR = [{ title: { contains: q, mode: 'insensitive' } }, ...(seq !== null ? [{ seq }] : [])];
  }
  const rows = await db.problem.findMany({
    where, orderBy: [{ phase: 'asc' }, { seq: 'desc' }],
    include: { _count: { select: { incidents: true, articles: true } }, incidents: { where: { status: { notIn: ['RESOLVED', 'CLOSED'] } }, select: { id: true } } },
  });
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: 'id', header: t.colId, render: (r) => <Link href={`/problems/${formatDocNo('PRB', r.seq)}`} className="inline-flex min-h-[44px] items-center font-mono text-[13px]">{formatDocNo('PRB', r.seq)}</Link> },
    {
      key: 'title', header: t.colTitle,
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{r.title}</span>
          <span className="text-xs text-muted">{r.workaround ? t.hasWorkaround : t.noWorkaround}{r.workNote ? ` · ${r.workNote}` : ''}</span>
        </span>
      ),
    },
    { key: 'phase', header: t.colPhase, render: (r) => <StatusBadge tone={PHASE_TONE[r.phase]} className="text-xs">{r.phaseLabel ?? th.problemPhase[r.phase]}</StatusBadge> },
    { key: 'inc', header: t.colLinked, hideOnSmall: true, render: (r) => <span className="font-mono text-[13px]">{r._count.incidents} <span className="font-sans text-xs text-muted">({t.open(r.incidents.length)})</span></span> },
    { key: 'kb', header: t.colKnowledge, hideOnSmall: true, render: (r) => <span className="font-mono text-[13px]">{r._count.articles}</span> },
  ];

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <form method="get" action="/problems" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{th.common.search}
            <input type="search" name="q" defaultValue={sp.q} placeholder={t.searchPlaceholder} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterPhase}
            <select name="phase" defaultValue={sp.phase ?? ''} className={control}>
              <option value="">{t.allPhases}</option>
              {PHASES.map((p) => <option key={p} value={p}>{th.problemPhase[p]}</option>)}
            </select>
          </label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{th.common.search}</button>
          <Link href="/problems" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
        </form>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted" aria-live="polite">{th.common.total(rows.length)}</span>
            {can(user?.role as Role, 'problem.manage') && (
              <Link href="/problems/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{t.newBtn}</Link>
            )}
          </div>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={th.dashboard.queueEmpty} gridClass="grid-cols-[96px_minmax(0,1fr)_130px] md:grid-cols-[104px_minmax(0,2fr)_160px_120px_80px]" />
        </Card>
      </div>
    </>
  );
}
