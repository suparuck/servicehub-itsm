import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui';
import { th } from '@/i18n/th';
import { DEFAULT_ALERT_DAYS } from '@/lib/asset';
import { getAudit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/currentUser';
import { can, type Role } from '@/lib/permissions';
import { getAssetAlertDays } from '@/lib/settingsService';
import { resetAssetDaysAction, saveAssetDaysAction } from './actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user.role as Role, 'settings.manage')) notFound();
  const [days, activity] = await Promise.all([getAssetAlertDays(), getAudit('SETTINGS', 'alerts')]);
  const t = th.alerts;
  const isDefault = days.join() === DEFAULT_ALERT_DAYS.join();
  return (
    <>
      <PageHeader breadcrumb={<><Link href="/admin/users">ผู้ดูแลระบบ</Link> › {t.title}</>} title={t.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[860px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        {sp.saved && <div role="status" className="rounded-control border border-ok bg-ok-tint px-3 py-2.5 text-sm text-ok-fg">{t.saved}</div>}

        <Card className="gap-3 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.assetTitle}</h2>
          <p className="m-0 text-sm text-muted">{t.assetIntro}</p>
          <p className="m-0 text-sm" data-testid="current"><strong>{t.current(days)}</strong> {isDefault && <span className="text-muted">{t.isDefault}</span>}</p>
          <p className="m-0 text-sm text-muted" data-testid="preview">{t.preview(days)}</p>
          <form action={saveAssetDaysAction} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-[13px] font-medium">{t.fieldLabel}
              <input name="days" required defaultValue={days.join(', ')} inputMode="numeric" aria-describedby="days-hint" className={field} />
              <span id="days-hint" className="text-xs font-normal text-muted">{t.fieldHint}</span>
            </label>
            <button type="submit" className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{t.save}</button>
          </form>
          {!isDefault && (
            <form action={resetAssetDaysAction}>
              <button type="submit" className="h-11 rounded-control border border-input bg-surface px-4 text-sm">{t.reset}</button>
            </form>
          )}
          <p className="m-0 text-xs text-muted">{t.note}</p>
        </Card>

        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.activity}</h2>
          <ActivityLog items={activity} empty={th.common.activityNone} />
        </Card>
      </div>
    </>
  );
}
