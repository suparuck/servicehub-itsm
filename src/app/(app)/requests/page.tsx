import Link from 'next/link';
import type { Prisma, RequestStatus as DbStatus } from '@prisma/client';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, StatusBadge, type Column, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { thDateShort } from '@/lib/datetime';
import { formatDocNo, parseDocNo } from '@/lib/docno';
import type { RequestStatus } from '@/lib/request';

export const dynamic = 'force-dynamic';
const TONE: Record<RequestStatus, Tone> = { SUBMITTED: 'neutral', PENDING_APPROVAL: 'warn', FULFILLING: 'accent', DELIVERED: 'ok', REJECTED: 'critical', CANCELLED: 'neutral' };
const ALL = Object.keys(th.portal.requestState) as RequestStatus[];
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const t = th.requestAdmin;
  const user = await getCurrentUser();
  const where: Prisma.ServiceRequestWhereInput = {};
  if (sp.status === 'all') { /* ทั้งหมด */ }
  else if (ALL.includes(sp.status as RequestStatus)) where.status = sp.status as DbStatus;
  else where.status = { in: ['SUBMITTED', 'PENDING_APPROVAL', 'FULFILLING'] };
  const q = sp.q?.trim();
  if (q) {
    const seq = parseDocNo('REQ', q) ?? (/^\d+$/.test(q) ? Number(q) : null);
    where.OR = [{ title: { contains: q, mode: 'insensitive' } }, ...(seq !== null ? [{ seq }] : [])];
  }
  const rows = await db.serviceRequest.findMany({ where, orderBy: { createdAt: 'desc' }, include: { requester: true, catalog: true } });
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: 'id', header: t.colId, render: (r) => <Link href={`/requests/${formatDocNo('REQ', r.seq)}`} className="inline-flex min-h-[44px] items-center font-mono text-[13px]">{formatDocNo('REQ', r.seq)}</Link> },
    { key: 'title', header: t.colTitle, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'req', header: t.colRequester, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.requester?.name ?? '—'}</span> },
    { key: 'cat', header: t.colCatalog, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.catalog?.name ?? '—'}</span> },
    { key: 'st', header: t.colStatus, render: (r) => <StatusBadge tone={TONE[r.status]} className="text-xs">{th.portal.requestState[r.status]}</StatusBadge> },
    { key: 'at', header: t.colCreated, hideOnSmall: true, render: (r) => <span className="font-mono text-xs text-muted">{thDateShort(r.createdAt)}</span> },
  ];
  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <form method="get" action="/requests" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{th.common.search}
            <input type="search" name="q" defaultValue={sp.q} placeholder={t.searchPlaceholder} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterStatus}
            <select name="status" defaultValue={sp.status ?? ''} className={control}>
              <option value="">{t.activeStatuses}</option>
              <option value="all">{t.allStatuses}</option>
              {ALL.map((s) => <option key={s} value={s}>{th.portal.requestState[s]}</option>)}
            </select>
          </label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{th.common.search}</button>
          <Link href="/requests" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
        </form>
        <Card>
          <span className="text-sm text-muted" aria-live="polite">{th.common.total(rows.length)}</span>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={th.dashboard.queueEmpty} gridClass="grid-cols-[96px_minmax(0,1fr)_130px] md:grid-cols-[100px_minmax(0,2fr)_150px_170px_130px_90px]" />
        </Card>
      </div>
    </>
  );
}
