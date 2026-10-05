import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge, cx, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import { STATUS_FLOW, boardFor, type ChangeStatus } from '@/lib/change';
import { conflictsFor } from '@/lib/changeService';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { thDateTime, thWindow } from '@/lib/datetime';
import { formatDocNo, parseDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';
import { cancelAction, completeAction, decideAction, failAction, scheduleAction, startAction, submitAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm';
const btn = 'inline-flex h-11 items-center rounded-control border border-input bg-surface px-4 text-sm text-ink no-underline hover:text-ink';
const primary = 'inline-flex h-11 items-center rounded-control bg-accent px-5 text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white';
const TYPE_TONE: Record<string, Tone> = { STANDARD: 'ok', NORMAL: 'accent', EMERGENCY: 'critical' };
const STATUS_TONE: Record<ChangeStatus, Tone> = { DRAFT: 'neutral', AWAITING_APPROVAL: 'warn', APPROVED: 'ok', SCHEDULED: 'accent', IMPLEMENTING: 'accent', COMPLETED: 'ok', FAILED: 'critical', CANCELLED: 'neutral' };

export default async function ChangeDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id: docParam } = await params;
  const sp = await searchParams;
  const seq = parseDocNo('CHG', decodeURIComponent(docParam));
  if (seq === null) notFound();
  const change = await db.change.findUnique({
    where: { seq },
    include: { service: true, problem: true, release: true, cis: { include: { ci: true } }, approvals: { include: { approver: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!change) notFound();
  const [user, activity, conflicts] = await Promise.all([getCurrentUser(), getAudit('CHANGE', change.id), conflictsFor(change.id)]);
  const t = th.change.detail;
  const role = user?.role as Role | undefined;
  const status = change.status as ChangeStatus;
  const no = formatDocNo('CHG', change.seq);
  const board = boardFor(change.type);
  const myApproval = change.approvals.find((a) => a.approverId === user?.id && a.decision === 'PENDING');
  const canCreate = can(role, 'change.create');
  const canManage = can(role, 'change.manage');
  const flowIdx = STATUS_FLOW.indexOf(status);
  const hasActions = (status === 'DRAFT' && canCreate) || (['APPROVED', 'SCHEDULED', 'IMPLEMENTING'].includes(status) && canManage) || (status === 'SCHEDULED' && canManage) || (status === 'APPROVED' && canManage) || (status === 'DRAFT' && canCreate);

  return (
    <>
      <PageHeader breadcrumb={<><Link href="/changes">{th.change.title}</Link> › {no}</>} title={change.title} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        {conflicts.length > 0 && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(status) && (
          <div role="status" className="rounded-control border border-warn bg-warn-tint px-3 py-2.5 text-sm text-warn-fg">
            <strong>{t.conflictTitle}:</strong>{' '}
            {conflicts.map((c, i) => (
              <span key={c.id}>{i > 0 && ' · '}<Link href={`/changes/${c.no}`}>{c.no}</Link> ({c.reason === 'CI' ? t.conflictCi : t.conflictService})</span>
            ))}
          </div>
        )}

        <Card className="gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm text-muted">{no}</span>
            <StatusBadge tone={TYPE_TONE[change.type]} className="px-2.5 py-1 text-xs">{th.changeType[change.type]}</StatusBadge>
            <StatusBadge tone={STATUS_TONE[status]} className="px-2.5 py-1 text-xs">{th.changeStatus[status]}</StatusBadge>
            <span className="text-xs text-muted">{th.change.riskPrefix}{th.risk[change.risk]}</span>
          </div>
          <ol aria-label="วงจรชีวิต Change" className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-6">
            {STATUS_FLOW.map((s, i) => (
              <li key={s} aria-current={s === status ? 'step' : undefined} className="flex flex-col gap-1.5">
                <span className={cx('block h-1.5 rounded-[3px]', flowIdx >= 0 && i < flowIdx ? 'bg-ink' : s === status ? 'bg-accent' : 'bg-border')} />
                <span className={cx('text-[13px]', s === status ? 'font-bold' : i > flowIdx ? 'text-muted' : '')}>{i + 1}. {th.change.steps[i]}</span>
              </li>
            ))}
          </ol>
          {['FAILED', 'CANCELLED'].includes(status) && <span role="status" className="text-sm font-semibold text-critical-fg">{th.changeStatus[status]}</span>}
          <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              [t.window, `${thDateTime(change.windowStart)}${change.windowEnd ? ` – ${thWindow(change.windowEnd, null)} น.` : ''}`],
              [t.service, change.service?.name ?? '—'],
              [t.problem, change.problem ? `${formatDocNo('PRB', change.problem.seq)} · ${change.problem.title}` : '—'],
              [th.release.releaseOf, change.release ? `${formatDocNo('REL', change.release.seq)} · ${change.release.name}` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-control bg-subtle px-3 py-2.5">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="m-0 text-sm font-semibold">{k === t.problem && change.problem ? <Link href={`/problems/${formatDocNo('PRB', change.problem.seq)}`} className="inline-flex min-h-[44px] items-center">{v}</Link> : k === th.release.releaseOf && change.release ? <Link href={`/releases/${formatDocNo('REL', change.release.seq)}`} className="inline-flex min-h-[44px] items-center">{v}</Link> : v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            {[[t.description, change.description], [t.impl, change.implementationPlan], [t.backout, change.backoutPlan], [t.outcome, change.outcome]].map(([k, v]) => v ? (
              <Card key={k as string} className="gap-2 p-5">
                <h2 className="m-0 text-[17px] font-semibold">{k as string}</h2>
                <p className="m-0 whitespace-pre-line text-[15px] leading-[1.7]">{v as string}</p>
              </Card>
            ) : null)}
            <Card className="p-5">
              <h2 className="m-0 text-[17px] font-semibold">{th.common.activity}</h2>
              <ActivityLog items={activity} empty={th.common.activityNone} />
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Card className="gap-3 p-5">
              <h2 className="m-0 text-[17px] font-semibold">{t.actions}</h2>
              {!hasActions && !myApproval && <p className="m-0 text-sm text-muted">{canCreate || canManage ? t.noActions : t.viewOnly}</p>}
              <div className="flex flex-wrap gap-2">
                {status === 'DRAFT' && canCreate && (
                  <>
                    <form action={submitAction.bind(null, change.id)}><button type="submit" className={primary}>{t.submit}</button></form>
                    <Link href={`/changes/${no}/edit`} className={btn}>{t.edit}</Link>
                  </>
                )}
                {status === 'APPROVED' && canManage && <form action={scheduleAction.bind(null, change.id)}><button type="submit" className={primary}>{t.schedule}</button></form>}
                {status === 'SCHEDULED' && canManage && <form action={startAction.bind(null, change.id)}><button type="submit" className={primary}>{t.start}</button></form>}
              </div>
              {status === 'IMPLEMENTING' && canManage && (
                <form className="flex flex-col gap-2">
                  <label htmlFor="outcome" className="text-[13px] font-medium">{t.completeLabel}</label>
                  <textarea id="outcome" name="outcome" rows={3} required className={`${field} py-3`} />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" formAction={completeAction.bind(null, change.id)} className={primary}>{t.complete}</button>
                    <button type="submit" formAction={failAction.bind(null, change.id)} className={`${btn} text-critical-fg`}>{t.fail}</button>
                  </div>
                </form>
              )}
              {((status === 'DRAFT' && canCreate) || (['AWAITING_APPROVAL', 'APPROVED', 'SCHEDULED'].includes(status) && canManage)) && (
                <form action={cancelAction.bind(null, change.id)} className="flex flex-col gap-2 border-t border-divider pt-3">
                  <label htmlFor="reason" className="text-[13px] font-medium">{t.cancelLabel}</label>
                  <input id="reason" name="reason" required className={`${field} min-h-11`} />
                  <button type="submit" className={`${btn} self-start text-critical-fg`}>{t.cancel}</button>
                </form>
              )}
            </Card>

            <Card className="gap-3 p-5">
              <h2 className="m-0 text-[17px] font-semibold">{t.approvalsTitle} {board ?? ''}</h2>
              {!board && <p className="m-0 text-sm text-muted">{t.standardNote}</p>}
              {board && change.approvals.length === 0 && <p className="m-0 text-sm text-muted">{t.approvalsNone}</p>}
              {board && <span className="text-xs text-muted">{change.type === 'EMERGENCY' ? t.quorumEmergency : t.quorumNormal}</span>}
              {change.approvals.map((a) => (
                <div key={a.id} className="flex flex-col gap-1 border-t border-divider pt-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{a.approver.name}</span>
                    <StatusBadge tone={a.decision === 'APPROVED' ? 'ok' : a.decision === 'REJECTED' ? 'critical' : 'warn'}>
                      {a.decision === 'APPROVED' ? t.approved : a.decision === 'REJECTED' ? t.rejected : t.pending}
                    </StatusBadge>
                  </div>
                  {a.comment && <span className="text-xs text-muted">{a.comment}</span>}
                  {a.decidedAt && <span className="text-xs text-muted">{thDateTime(a.decidedAt)}</span>}
                </div>
              ))}
              {myApproval && status === 'AWAITING_APPROVAL' && (
                <form className="flex flex-col gap-2 rounded-control bg-accent-tint p-3" aria-label={t.yourDecision}>
                  <label htmlFor="comment" className="text-[13px] font-medium text-accent-hover">{t.yourDecision} — {t.comment}</label>
                  <textarea id="comment" name="comment" rows={2} className={`${field} py-2`} />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" formAction={decideAction.bind(null, change.id, 'APPROVED')} className={primary}>{t.approve}</button>
                    <button type="submit" formAction={decideAction.bind(null, change.id, 'REJECTED')} className={`${btn} text-critical-fg`}>{t.reject}</button>
                  </div>
                </form>
              )}
            </Card>

            <Card className="gap-2 p-5">
              <h2 className="m-0 text-[17px] font-semibold">{t.cis}</h2>
              {change.cis.length === 0 && <p className="m-0 text-sm text-muted">{t.cisNone}</p>}
              {change.cis.map(({ ci }) => (
                <Link key={ci.id} href={`/cmdb/${ci.ciId}`} className="flex min-h-[44px] flex-col justify-center text-sm">
                  <span className="font-medium">{ci.name}</span>
                  <span className="text-xs text-muted">{ci.classLabel ?? ci.ciClass}</span>
                </Link>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
