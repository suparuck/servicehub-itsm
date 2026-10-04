import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { assetlessCis } from '@/lib/assetService';
import { getCurrentUser } from '@/lib/currentUser';
import { can, type Role } from '@/lib/permissions';
import { createAssetAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';

export default async function NewAssetPage({ searchParams }: { searchParams: Promise<{ error?: string; ci?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user.role as Role, 'asset.manage')) notFound();
  const cis = await assetlessCis();
  const t = th.asset;
  const f = t.form;
  return (
    <>
      <PageHeader breadcrumb={<><Link href="/assets">{t.title}</Link> › {t.newTitle}</>} title={t.newTitle} initials={user.initials} />
      <div className="box-border w-full max-w-[760px] px-7 pb-10 pt-6">
        {cis.length === 0 ? (
          <div role="status" className="flex flex-col gap-2 rounded-card border border-border bg-surface p-5 text-sm">
            <span>{f.noCi}</span>
            <span className="text-muted">{f.ciHint}</span>
            <Link href="/cmdb/new" className="inline-flex min-h-11 items-center self-start">+ เพิ่ม CI ใน CMDB</Link>
          </div>
        ) : (
          <form action={createAssetAction} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
            {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ciId" className="text-[13px] font-medium">{f.ci} <span aria-hidden="true" className="text-critical">*</span></label>
              <select id="ciId" name="ciId" required defaultValue={sp.ci ?? ''} aria-describedby="ci-hint" className={field}>
                <option value="" disabled>— เลือก CI —</option>
                {cis.map((c) => <option key={c.ciId} value={c.ciId}>{c.name} ({c.ciId} · {t.classes[c.ciClass as keyof typeof t.classes] ?? c.ciClass})</option>)}
              </select>
              <span id="ci-hint" className="text-xs text-muted">{f.ciHint}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.initialStatus}
                <select name="status" defaultValue="IN_STOCK" className={field}>
                  {(['ORDERED', 'IN_STOCK', 'IN_USE'] as const).map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.vendor}<input name="vendor" maxLength={100} className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.serial}<input name="serialNo" maxLength={80} className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.location}<input name="location" maxLength={100} className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.cost}<input name="costBaht" inputMode="numeric" className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.purchased}<input name="purchasedAt" type="date" className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.supportUntil} / {f.licenseExpires}<input name="supportUntil" type="date" className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.licenseQty} (เฉพาะไลเซนส์)<input name="licenseQty" inputMode="numeric" className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.licenseUsed} (เฉพาะไลเซนส์)<input name="licenseUsed" inputMode="numeric" className={field} /></label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{f.create}</button>
              <Link href="/assets" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{th.common.cancel}</Link>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
