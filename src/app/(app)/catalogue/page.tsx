import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, StatusBadge, type Column, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { listCategories, listServices } from '@/lib/catalogueService';
import { getCurrentUser } from '@/lib/currentUser';
import { can, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
const HEALTH_TONE: Record<string, Tone> = { OK: 'ok', DEGRADED: 'warn', DOWN: 'critical' };
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; health?: string }> }) {
  const sp = await searchParams;
  const t = th.catalogue;
  const user = await getCurrentUser();
  const [rows, categories] = await Promise.all([listServices(sp), listCategories()]);
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    { key: 'code', header: t.colCode, render: (r) => <Link href={`/catalogue/${r.code}`} className="inline-flex min-h-[44px] items-center font-mono text-[13px]">{r.code}</Link> },
    { key: 'name', header: t.colName, render: (r) => <span className="flex flex-col"><span className="font-medium">{r.name}</span><span className="text-xs text-muted">{r.category ?? '—'}</span></span> },
    { key: 'owner', header: t.colOwner, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.ownerName ?? <span className="text-muted">{t.noOwner}</span>}</span> },
    { key: 'sla', header: t.colSla, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.sla?.name ?? <span className="text-muted">{t.noSla}</span>}</span> },
    { key: 'off', header: t.colOfferings, hideOnSmall: true, render: (r) => <span className="font-mono text-[13px]">{r._count.offerings}</span> },
    { key: 'items', header: t.colItems, hideOnSmall: true, render: (r) => <span className="font-mono text-[13px]">{r._count.catalogItems}</span> },
    { key: 'open', header: t.colOpen, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.openIncidents + r.openChanges === 0 ? '—' : [r.openIncidents ? t.openInc(r.openIncidents) : '', r.openChanges ? t.openChg(r.openChanges) : ''].filter(Boolean).join(' · ')}</span> },
    { key: 'health', header: t.colHealth, render: (r) => <StatusBadge tone={HEALTH_TONE[r.health]} className="text-xs">{t.health[r.health]}</StatusBadge> },
  ];

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {can(user.role as Role, 'catalogue.manage') && (
            <Link href="/catalogue/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{t.newBtn}</Link>
          )}
        </div>
        <form method="get" action="/catalogue" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{th.common.search}
            <input type="search" name="q" defaultValue={sp.q} placeholder={t.searchPlaceholder} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterCategory}
            <select name="category" defaultValue={sp.category ?? ''} className={control}>
              <option value="">{t.allCategories}</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterHealth}
            <select name="health" defaultValue={sp.health ?? ''} className={control}>
              <option value="">{t.allHealth}</option>
              {(['OK', 'DEGRADED', 'DOWN'] as const).map((h) => <option key={h} value={h}>{t.health[h]}</option>)}
            </select>
          </label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{th.common.search}</button>
          <Link href="/catalogue" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
        </form>
        <Card>
          <span className="text-sm text-muted" aria-live="polite">{t.total(rows.length)} · {t.healthNote}</span>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={th.dashboard.queueEmpty} gridClass="grid-cols-[96px_minmax(0,1fr)_100px] md:grid-cols-[100px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_70px_100px_140px_110px]" />
        </Card>
      </div>
    </>
  );
}
