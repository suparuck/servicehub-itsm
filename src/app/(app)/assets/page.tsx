import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, StatusBadge, type Column, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { ASSET_CLASSES, expiringWindow, licenseState, supportState, type AssetStatus } from '@/lib/asset';
import { assetSummary, listAssets } from '@/lib/assetService';
import { getAssetAlertDays } from '@/lib/settingsService';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateShort } from '@/lib/datetime';
import { can, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';
const STATUS_TONE: Record<AssetStatus, Tone> = { ORDERED: 'neutral', IN_STOCK: 'accent', IN_USE: 'ok', IN_REPAIR: 'warn', RETIRED: 'neutral' };
const SUPPORT_TONE: Record<string, Tone> = { ACTIVE: 'ok', EXPIRING: 'warn', EXPIRED: 'critical', NONE: 'neutral' };
type SP = { q?: string; cls?: string; status?: string; support?: string };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = th.asset;
  const user = await getCurrentUser();
  const [rows, sum, alertDays] = await Promise.all([listAssets(sp), assetSummary(), getAssetAlertDays()]);
  const windowDays = expiringWindow(alertDays);
  type Row = (typeof rows)[number];
  const now = new Date();
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  const tiles: { key: keyof typeof t.tiles; n: number; href: string; tone?: Tone }[] = [
    { key: 'total', n: sum.total, href: '/assets' },
    { key: 'inUse', n: sum.inUse, href: '/assets?status=IN_USE' },
    { key: 'inStock', n: sum.inStock, href: '/assets?status=IN_STOCK' },
    { key: 'inRepair', n: sum.inRepair, href: '/assets?status=IN_REPAIR', tone: 'warn' },
    { key: 'expiring', n: sum.expiring, href: '/assets?support=expiring', tone: 'warn' },
    { key: 'expired', n: sum.expired, href: '/assets?support=expired', tone: 'critical' },
    { key: 'licenseOver', n: sum.licenseOver, href: '/assets?cls=SOFTWARE_LICENSE', tone: 'critical' },
  ];

  const columns: Column<Row>[] = [
    { key: 'tag', header: t.colTag, render: (r) => <Link href={`/assets/${r.assetTag}`} className="inline-flex min-h-[44px] items-center font-mono text-[12px]">{r.assetTag}</Link> },
    { key: 'name', header: t.colName, render: (r) => <span className="flex flex-col"><span className="font-medium">{r.ci.name}</span><span className="font-mono text-xs text-muted">{r.ci.ciId}{r.serialNo ? ` · ${r.serialNo}` : ''}</span></span> },
    { key: 'cls', header: t.colClass, hideOnSmall: true, render: (r) => <span className="text-[13px]">{t.classes[r.ci.ciClass as keyof typeof t.classes] ?? r.ci.ciClass}</span> },
    { key: 'holder', header: t.colHolder, hideOnSmall: true, render: (r) => <span className="flex flex-col text-[13px]"><span>{r.assignedTo?.name ?? '—'}</span><span className="text-xs text-muted">{r.location ?? ''}</span></span> },
    {
      key: 'support', header: t.colSupport, hideOnSmall: true,
      render: (r) => {
        if (r.ci.ciClass === 'SOFTWARE_LICENSE' && licenseState(r.licenseQty, r.licenseUsed) !== 'NA') {
          const ls = licenseState(r.licenseQty, r.licenseUsed);
          if (ls === 'OVER' || ls === 'NEAR') return <StatusBadge tone={ls === 'OVER' ? 'critical' : 'warn'}>{t.license[ls]}</StatusBadge>;
        }
        if (r.status === 'RETIRED') return <span className="text-[13px] text-muted">—</span>;
        const s = supportState(r.supportUntil, now, windowDays);
        return s === 'NONE' ? <span className="text-[13px] text-muted">—</span> : <StatusBadge tone={SUPPORT_TONE[s]}>{t.support[s]}{r.supportUntil && s !== 'ACTIVE' ? ` · ${thDateShort(r.supportUntil)}` : ''}</StatusBadge>;
      },
    },
    { key: 'st', header: t.colStatus, render: (r) => <StatusBadge tone={STATUS_TONE[r.status]} className="text-xs">{t.status[r.status]}</StatusBadge> },
  ];

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4 xl:grid-cols-7" aria-label="สรุป" data-testid="tiles">
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
          <a href={`/assets/export${qs ? `?${qs}` : ''}`} download className="inline-flex min-h-11 items-center text-sm">{t.exportBtn}</a>
          {can(user.role as Role, 'asset.manage') && (
            <Link href="/assets/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{t.newBtn}</Link>
          )}
        </div>

        <form method="get" action="/assets" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{th.common.search}
            <input type="search" name="q" defaultValue={sp.q} placeholder={t.searchPlaceholder} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterClass}
            <select name="cls" defaultValue={sp.cls ?? ''} className={control}>
              <option value="">{t.allClasses}</option>
              {ASSET_CLASSES.map((c) => <option key={c} value={c}>{t.classes[c as keyof typeof t.classes]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterStatus}
            <select name="status" defaultValue={sp.status ?? ''} className={control}>
              <option value="">{t.allStatuses}</option>
              {(Object.keys(t.status) as AssetStatus[]).map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterSupport}
            <select name="support" defaultValue={sp.support ?? ''} className={control}>
              <option value="">{t.allSupport}</option>
              <option value="expiring">{t.supportExpiring(windowDays)}</option>
              <option value="expired">{t.supportExpired}</option>
            </select>
          </label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{th.common.search}</button>
          <Link href="/assets" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
        </form>

        <Card>
          <span className="text-sm text-muted" aria-live="polite">{t.total(rows.length)}</span>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={th.dashboard.queueEmpty} gridClass="grid-cols-[130px_minmax(0,1fr)_110px] md:grid-cols-[140px_minmax(0,1.6fr)_130px_minmax(0,1.2fr)_minmax(0,1.2fr)_110px]" />
        </Card>
      </div>
    </>
  );
}
