import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { ReleaseFormFields } from '@/components/ReleaseFormFields';
import { Card, StatusBadge, cx, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import type { ChangeStatus } from '@/lib/change';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateShort, thWindow } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';
import { GO_LABEL, REL_FLOW, canEditPackage, canEditPlan, canReview, goNoGo, goReady, isFinalRel, nextRelStatuses, type RelStatus } from '@/lib/release';
import { eligibleChanges, getRelease, releaseFormOptions } from '@/lib/releaseService';
import { addChangeAction, moveStatusAction, removeChangeAction, reviewAction, updateReleaseAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';
const btn = 'h-11 rounded-control border border-input bg-surface px-4 text-sm';
const TONE: Record<RelStatus, Tone> = { PLANNED: 'neutral', IN_BUILD: 'accent', READY: 'ok', DEPLOYING: 'warn', DEPLOYED: 'ok', ROLLED_BACK: 'critical', CANCELLED: 'neutral' };
const CHG_TONE: Record<ChangeStatus, Tone> = { DRAFT: 'neutral', AWAITING_APPROVAL: 'warn', APPROVED: 'ok', SCHEDULED: 'accent', IMPLEMENTING: 'accent', COMPLETED: 'ok', FAILED: 'critical', CANCELLED: 'neutral' };

export default async function ReleaseDetail({ params, searchParams }: { params: Promise<{ no: string }>; searchParams: Promise<{ error?: string }> }) {
  const { no } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const rel = await getRelease(decodeURIComponent(no));
  if (!rel) notFound();
  const manage = can(user.role as Role, 'release.manage');
  const [options, activity, eligible] = await Promise.all([releaseFormOptions(), getAudit('RELEASE', rel.id), manage && canEditPackage(rel.status) ? eligibleChanges() : Promise.resolve([])]);
  const t = th.release;
  const f = t.form;
  const docNo = formatDocNo('REL', rel.seq);
  const go = goNoGo(rel, rel.changes.map((c) => ({ docNo: formatDocNo('CHG', c.seq), status: c.status })));
  const ready = goReady(go);
  const next = nextRelStatuses(rel.status);
  const editable = manage && canEditPlan(rel.status);
  const final = isFinalRel(rel.status);
  const flowIndex = REL_FLOW.indexOf(rel.status);

  return (
    <>
      <PageHeader breadcrumb={<><Link href="/releases">{t.title}</Link> › {docNo}</>} title={rel.name} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1000px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}

        <Card className="gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm text-muted">{docNo}</span>
            {rel.version && <span className="font-mono text-sm">{rel.version}</span>}
            <StatusBadge tone={TONE[rel.status]} className="px-2.5 py-1 text-xs">{t.status[rel.status]}</StatusBadge>
            {rel.windowStart && <span className="text-sm text-muted">{thDateShort(rel.windowStart)} · {thWindow(rel.windowStart, rel.windowEnd)}</span>}
            {rel.service && <Link href={`/catalogue/${rel.service.code}`} className="inline-flex min-h-11 items-center text-sm">{rel.service.name}</Link>}
          </div>
          <ol className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-5" aria-label={t.flowTitle}>
            {REL_FLOW.map((s, i) => {
              const current = rel.status === s;
              const passed = flowIndex > i || rel.status === 'DEPLOYED';
              return (
                <li key={s} aria-current={current ? 'step' : undefined}
                  className={cx('flex min-h-11 items-center gap-2 rounded-control border px-2.5 py-2 text-xs', current ? 'border-accent bg-accent-tint font-semibold text-accent-hover' : passed ? 'border-ok bg-ok-tint text-ok-fg' : 'border-border bg-surface text-muted')}>
                  <span className="font-mono font-bold">{passed && !current ? '✓' : i + 1}</span><span>{t.status[s]}</span>
                </li>
              );
            })}
          </ol>
          {(rel.status === 'ROLLED_BACK' || rel.status === 'CANCELLED') && <div role="status" className="rounded-control border border-border bg-subtle px-3 py-2 text-sm">{t.status[rel.status]} — {t.finalNote}</div>}
        </Card>

        {!final && (
          <Card className="gap-2 p-5">
            <h2 className="m-0 text-[17px] font-semibold">{t.goTitle}</h2>
            <ul className="m-0 flex list-none flex-col p-0" data-testid="go-list">
              {go.map((g) => (
                <li key={g.key} className="flex flex-wrap items-center gap-2 border-b border-divider py-1.5 text-sm last:border-b-0">
                  <StatusBadge tone={g.ok ? 'ok' : 'critical'} className="text-xs">{g.ok ? t.goPass : t.goFail}</StatusBadge>
                  <span>{GO_LABEL[g.key]}</span>
                  {g.detail && <span className="font-mono text-xs text-muted">({g.detail})</span>}
                </li>
              ))}
            </ul>
            <span className="text-xs text-muted">{ready ? t.goReadyNote : t.goNotReadyNote}</span>
          </Card>
        )}

        <Card className="p-5">
          <form action={updateReleaseAction.bind(null, rel.seq)} className="flex flex-col gap-3">
            <fieldset disabled={!editable} className="m-0 flex flex-col gap-3 border-0 p-0">
              <ReleaseFormFields d={rel} options={options} />
              {editable && <button type="submit" className="h-11 self-start rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{f.save}</button>}
            </fieldset>
          </form>
        </Card>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.pkgTitle}</h2>
          {rel.changes.length === 0 ? <p className="m-0 text-sm text-muted">{t.pkgNone}</p> : (
            <ul className="m-0 flex list-none flex-col p-0" data-testid="package">
              {rel.changes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider py-1.5 last:border-b-0">
                  <Link href={`/changes/${formatDocNo('CHG', c.seq)}`} className="inline-flex min-h-11 items-center font-mono text-[13px]">{formatDocNo('CHG', c.seq)}</Link>
                  <span className="min-w-0 grow basis-[200px] text-sm">{c.title}</span>
                  <StatusBadge tone={CHG_TONE[c.status]} className="text-xs">{th.changeStatus[c.status]}</StatusBadge>
                  {manage && canEditPackage(rel.status) && (
                    <form action={removeChangeAction.bind(null, rel.seq, c.id)}>
                      <button type="submit" aria-label={`${t.pkgRemove} ${formatDocNo('CHG', c.seq)}`} className={`${btn} text-critical-fg`}>{t.pkgRemove}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {manage && canEditPackage(rel.status) ? (
            eligible.length === 0 ? <p className="m-0 text-xs text-muted">{t.pkgAddNone}</p> : (
              <form action={addChangeAction.bind(null, rel.seq)} className="flex flex-wrap items-end gap-3 border-t border-divider pt-3">
                <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-[13px] font-medium">{t.pkgAdd}
                  <select name="change" required defaultValue="" className={field}>
                    <option value="" disabled>—</option>
                    {eligible.map((c) => <option key={c.id} value={formatDocNo('CHG', c.seq)}>{formatDocNo('CHG', c.seq)} · {c.title} ({th.changeStatus[c.status]})</option>)}
                  </select>
                </label>
                <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.pkgAddBtn}</button>
              </form>
            )
          ) : manage && !final ? <p className="m-0 text-xs text-muted">{t.pkgLocked}</p> : null}
        </Card>

        {manage && next.length > 0 && (
          <Card className="gap-2 p-5">
            <h2 className="m-0 text-[17px] font-semibold">{t.moveTitle}</h2>
            <form action={moveStatusAction.bind(null, rel.seq)} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_2fr_auto]">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.moveTo}
                <select name="to" className={field}>{next.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}</select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.moveReason}<input name="reason" maxLength={300} className={field} /></label>
              <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.moveSubmit}</button>
            </form>
            <span className="text-xs text-muted">{t.moveHint}</span>
          </Card>
        )}

        {canReview(rel.status) && (
          <Card className="gap-2 p-5">
            <h2 className="m-0 text-[17px] font-semibold">{t.reviewTitle}</h2>
            <form action={reviewAction.bind(null, rel.seq)} className="flex flex-col gap-2">
              <fieldset disabled={!manage} className="m-0 flex flex-col gap-2 border-0 p-0">
                <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.reviewTitle}
                  <textarea name="review" rows={4} maxLength={4000} defaultValue={rel.review ?? ''} aria-describedby="rev-hint" className={`${field} py-3`} />
                  <span id="rev-hint" className="text-xs font-normal text-muted">{t.reviewHint}</span>
                </label>
                {manage && <button type="submit" className="h-11 self-start rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{t.reviewSave}</button>}
              </fieldset>
            </form>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.activity}</h2>
          <ActivityLog items={activity} empty={th.common.activityNone} />
        </Card>
        <Link href="/releases" className="inline-flex min-h-[44px] items-center self-start">{t.back}</Link>
      </div>
    </>
  );
}
