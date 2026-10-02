import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, StatusBadge, type Column } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { thDateShort } from '@/lib/datetime';
import { formatDocNo, parseDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';
import { searchTokens } from '@/lib/portal';

export const dynamic = 'force-dynamic';
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const t = th.kb;
  const user = await getCurrentUser();
  const where: Prisma.KnowledgeArticleWhereInput = {};
  if (sp.status === 'DRAFT' || sp.status === 'PUBLISHED') where.status = sp.status;
  const q = sp.q?.trim();
  if (q) {
    const seq = parseDocNo('KB', q) ?? (/^\d+$/.test(q) ? Number(q) : null);
    const tokens = searchTokens(q);
    where.OR = [
      ...(seq !== null ? [{ seq }] : []),
      ...(tokens.length ? tokens.flatMap((tk) => [{ title: { contains: tk, mode: 'insensitive' as const } }, { body: { contains: tk, mode: 'insensitive' as const } }]) : [{ title: { contains: q, mode: 'insensitive' as const } }]),
    ];
  }
  const rows = await db.knowledgeArticle.findMany({ where, orderBy: [{ status: 'desc' }, { views: 'desc' }], include: { problem: true } });
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: 'id', header: t.colId, render: (r) => <Link href={`/knowledge/${formatDocNo('KB', r.seq)}`} className="inline-flex min-h-[44px] items-center font-mono text-[13px]">{formatDocNo('KB', r.seq)}</Link> },
    { key: 'title', header: t.colTitle, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'st', header: t.colStatus, render: (r) => <StatusBadge tone={r.status === 'PUBLISHED' ? 'ok' : 'warn'} className="text-xs">{t.status[r.status]}</StatusBadge> },
    { key: 'views', header: t.colViews, hideOnSmall: true, render: (r) => <span className="font-mono text-[13px]">{r.views.toLocaleString('en-US')}</span> },
    { key: 'prb', header: t.colProblem, hideOnSmall: true, render: (r) => (r.problem ? <Link href={`/problems/${formatDocNo('PRB', r.problem.seq)}`} className="font-mono text-[13px]">{formatDocNo('PRB', r.problem.seq)}</Link> : <span className="text-muted">—</span>) },
    { key: 'upd', header: t.colUpdated, hideOnSmall: true, render: (r) => <span className="font-mono text-xs text-muted">{thDateShort(r.updatedAt)}</span> },
  ];
  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <form method="get" action="/knowledge" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{th.common.search}
            <input type="search" name="q" defaultValue={sp.q} placeholder={t.searchPlaceholder} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterStatus}
            <select name="status" defaultValue={sp.status ?? ''} className={control}>
              <option value="">{t.allStatuses}</option>
              <option value="PUBLISHED">{t.status.PUBLISHED}</option>
              <option value="DRAFT">{t.status.DRAFT}</option>
            </select>
          </label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{th.common.search}</button>
          <Link href="/knowledge" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
        </form>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted" aria-live="polite">{th.common.total(rows.length)}</span>
            {can(user?.role as Role, 'kb.manage') && <Link href="/knowledge/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{t.newBtn}</Link>}
          </div>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={th.dashboard.queueEmpty} gridClass="grid-cols-[96px_minmax(0,1fr)_110px] md:grid-cols-[100px_minmax(0,2fr)_120px_80px_100px_90px]" />
        </Card>
      </div>
    </>
  );
}
