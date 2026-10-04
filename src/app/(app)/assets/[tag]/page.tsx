import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { daysLeft, isLicenseClass, licenseState, nextStatuses, supportState, type AssetStatus } from '@/lib/asset';
import { assignableUsers, getAsset } from '@/lib/assetService';
import { getAudit } from '@/lib/audit';
import { bangkokYmd } from '@/lib/change';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateShort } from '@/lib/datetime';
import { can, type Role } from '@/lib/permissions';
import { changeStatusAction, updateAssetAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';
const STATUS_TONE: Record<AssetStatus, Tone> = { ORDERED: 'neutral', IN_STOCK: 'accent', IN_USE: 'ok', IN_REPAIR: 'warn', RETIRED: 'neutral' };
const SUPPORT_TONE: Record<string, Tone> = { ACTIVE: 'ok', EXPIRING: 'warn', EXPIRED: 'critical', NONE: 'neutral' };
const ymd = (d: Date | null) => (d ? bangkokYmd(d) : '');

export default async function AssetDetail({ params, searchParams }: { params: Promise<{ tag: string }>; searchParams: Promise<{ error?: string }> }) {
  const { tag } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const a = await getAsset(decodeURIComponent(tag));
  if (!a) notFound();
  const [users, activity] = await Promise.all([assignableUsers(), getAudit('ASSET', a.id)]);
  const manage = can(user.role as Role, 'asset.manage');
  const t = th.asset;
  const f = t.form;
  const license = isLicenseClass(a.ci.ciClass);
  const retired = a.status === 'RETIRED';
  const editable = manage && !retired;
  const next = nextStatuses(a.status);
  const now = new Date();
  const sState = retired ? 'NONE' : supportState(a.supportUntil, now);
  const lState = licenseState(a.licenseQty, a.licenseUsed);

  return (
    <>
      <PageHeader breadcrumb={<><Link href="/assets">{t.title}</Link> › {a.assetTag}</>} title={a.ci.name} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1000px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        {retired && <div role="status" className="rounded-control border border-border bg-subtle px-3 py-2.5 text-sm">{t.retiredNote}</div>}

        <Card className="gap-3 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.detailInfo}</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm">{a.assetTag}</span>
            <StatusBadge tone={STATUS_TONE[a.status]} className="px-2.5 py-1 text-xs">{t.status[a.status]}</StatusBadge>
            <span className="text-sm text-muted">{t.classes[a.ci.ciClass as keyof typeof t.classes] ?? a.ci.ciClass}</span>
            {sState !== 'NONE' && a.supportUntil && <StatusBadge tone={SUPPORT_TONE[sState]}>{t.support[sState]} · {t.supportUntilLabel(thDateShort(a.supportUntil), daysLeft(a.supportUntil, now))}</StatusBadge>}
            {license && lState !== 'NA' && <StatusBadge tone={lState === 'OVER' ? 'critical' : lState === 'NEAR' ? 'warn' : 'ok'}>{t.license[lState]} · {t.licenseUsage(a.licenseUsed ?? 0, a.licenseQty ?? 0)}</StatusBadge>}
            <Link href={`/cmdb/${a.ci.ciId}`} className="inline-flex min-h-11 items-center text-sm">{t.ciLink} ({a.ci.ciId})</Link>
          </div>
          {!license && (
            <p className="m-0 text-sm" data-testid="holder">
              <span className="text-muted">{t.holder}: </span>
              {a.assignedTo ? <><strong>{a.assignedTo.name}</strong>{a.assignedAt && <span className="text-muted"> {t.holderSince(thDateShort(a.assignedAt))}</span>}</> : <span className="text-muted">{t.noHolder}</span>}
            </p>
          )}
          <form action={updateAssetAction.bind(null, a.assetTag)} className="flex flex-col gap-3">
            <fieldset disabled={!editable} className="m-0 grid grid-cols-1 gap-3 border-0 p-0 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.vendor}<input name="vendor" maxLength={100} defaultValue={a.vendor ?? ''} className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.serial}<input name="serialNo" maxLength={80} defaultValue={a.serialNo ?? ''} className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.location}<input name="location" maxLength={100} defaultValue={a.location ?? ''} className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.cost}<input name="costBaht" inputMode="numeric" defaultValue={a.costBaht ?? ''} className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.purchased}<input name="purchasedAt" type="date" defaultValue={ymd(a.purchasedAt)} className={field} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{license ? f.licenseExpires : f.supportUntil}<input name="supportUntil" type="date" defaultValue={ymd(a.supportUntil)} className={field} /></label>
              {license && (
                <>
                  <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.licenseQty}<input name="licenseQty" inputMode="numeric" defaultValue={a.licenseQty ?? ''} className={field} /></label>
                  <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.licenseUsed}<input name="licenseUsed" inputMode="numeric" defaultValue={a.licenseUsed ?? ''} className={field} /></label>
                </>
              )}
              {editable && <div className="md:col-span-2"><button type="submit" className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{f.save}</button></div>}
            </fieldset>
          </form>
        </Card>

        {editable && next.length > 0 && (
          <Card className="gap-2 p-5">
            <h2 className="m-0 text-[17px] font-semibold">{t.moveTitle}</h2>
            <form action={changeStatusAction.bind(null, a.assetTag)} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.moveTo}
                <select name="to" className={field}>{next.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}</select>
              </label>
              {!license && (
                <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.moveHolder}
                  <select name="assigneeId" defaultValue="" aria-describedby="holder-hint" className={field}>
                    <option value="">— ไม่ระบุ —</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.moveNote}<input name="note" maxLength={300} className={field} /></label>
              <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.moveSubmit}</button>
            </form>
            {!license && <span id="holder-hint" className="text-xs text-muted">{t.moveHolderHint}</span>}
            <span className="text-xs text-muted">{t.retireWarn}</span>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.activity}</h2>
          <ActivityLog items={activity} empty={th.common.activityNone} />
        </Card>
        <Link href="/assets" className="inline-flex min-h-[44px] items-center self-start">{t.back}</Link>
      </div>
    </>
  );
}
