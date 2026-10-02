import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge, cx, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { thDateTime } from '@/lib/datetime';
import { formatDocNo, parseDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';
import { isFinished, requestStage, type RequestStatus } from '@/lib/request';
import { addTaskAction, cancelRequestAction, decideRequestAction, deliverAction, toggleTaskAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm';
const btn = 'inline-flex h-11 items-center rounded-control border border-input bg-surface px-4 text-sm text-ink no-underline hover:text-ink';
const primary = 'inline-flex h-11 items-center rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover';
const TONE: Record<RequestStatus, Tone> = { SUBMITTED: 'neutral', PENDING_APPROVAL: 'warn', FULFILLING: 'accent', DELIVERED: 'ok', REJECTED: 'critical', CANCELLED: 'neutral' };

export default async function RequestDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id: docParam } = await params;
  const sp = await searchParams;
  const seq = parseDocNo('REQ', decodeURIComponent(docParam));
  if (seq === null) notFound();
  const req = await db.serviceRequest.findUnique({
    where: { seq },
    include: { requester: true, catalog: true, approvals: { orderBy: { id: 'asc' } }, tasks: { orderBy: { id: 'asc' } }, survey: true },
  });
  if (!req) notFound();
  const [user, activity] = await Promise.all([getCurrentUser(), getAudit('REQUEST', req.id)]);
  const t = th.requestAdmin;
  const role = user?.role as Role | undefined;
  const status = req.status as RequestStatus;
  const no = formatDocNo('REQ', req.seq);
  const stage = requestStage(status);
  const canApprove = can(role, 'request.approve');
  const canFulfil = can(role, 'request.fulfil');
  const pendingStep = req.approvals.find((a) => !a.decision);
  const openTasks = req.tasks.filter((x) => !x.done).length;

  return (
    <>
      <PageHeader breadcrumb={<><Link href="/requests">{t.title}</Link> › {no}</>} title={req.title} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1200px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        {!canApprove && !canFulfil && <div role="status" className="rounded-control bg-accent-tint px-3 py-2.5 text-sm text-accent-hover">{t.viewOnly}</div>}

        <Card className="gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm text-muted">{no}</span>
            <StatusBadge tone={TONE[status]} className="px-2.5 py-1 text-xs">{th.portal.requestState[status]}</StatusBadge>
            {req.nextNote && <span className="text-xs text-muted">{req.nextNote}</span>}
          </div>
          <ol aria-label="ความคืบหน้า" className="m-0 grid list-none grid-cols-4 gap-1.5 p-0">
            {th.portal.requestSteps.map((s, i) => (
              <li key={s} aria-current={i + 1 === stage ? 'step' : undefined} className="flex flex-col gap-1.5">
                <span className={cx('block h-1.5 rounded-[3px]', i + 1 < stage || status === 'DELIVERED' ? 'bg-ink' : i + 1 === stage ? 'bg-accent' : 'bg-border')} />
                <span className={cx('text-[13px]', i + 1 === stage ? 'font-bold' : i + 1 > stage ? 'text-muted' : '')}>{i + 1}. {s}</span>
              </li>
            ))}
          </ol>
          <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[[t.requester, req.requester?.name ?? '—'], [t.catalog, req.catalog?.name ?? '—'], [t.colCreated, thDateTime(req.createdAt)]].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-control bg-subtle px-3 py-2.5"><dt className="text-xs text-muted">{k}</dt><dd className="m-0 text-sm font-semibold">{v}</dd></div>
            ))}
          </dl>
          {req.description && <p className="m-0 whitespace-pre-line text-[15px] leading-[1.7]">{req.description}</p>}
          {req.survey && <span className="text-sm text-ok-fg">{t.survey}: {req.survey.score}/5{req.survey.comment ? ` · ${req.survey.comment}` : ''}</span>}
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="gap-3 p-5">
            <h2 className="m-0 text-[17px] font-semibold">{t.approvals}</h2>
            {req.approvals.length === 0 && <p className="m-0 text-sm text-muted">{t.approvalNone}</p>}
            {req.approvals.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 border-t border-divider pt-2 text-sm">
                <span>{a.approver}</span>
                <StatusBadge tone={a.decision === 'APPROVED' ? 'ok' : a.decision === 'REJECTED' ? 'critical' : 'warn'}>{a.decision === 'APPROVED' ? t.approved : a.decision === 'REJECTED' ? t.rejected : t.pending}</StatusBadge>
              </div>
            ))}
            {pendingStep && status === 'PENDING_APPROVAL' && canApprove && (
              <form className="flex flex-col gap-2 rounded-control bg-accent-tint p-3">
                <label htmlFor="comment" className="text-[13px] font-medium text-accent-hover">{t.comment}</label>
                <textarea id="comment" name="comment" rows={2} className={`${field} py-2`} />
                <div className="flex flex-wrap gap-2">
                  <button type="submit" formAction={decideRequestAction.bind(null, req.id, 'APPROVED')} className={primary}>{t.approve}</button>
                  <button type="submit" formAction={decideRequestAction.bind(null, req.id, 'REJECTED')} className={`${btn} text-critical-fg`}>{t.reject}</button>
                </div>
              </form>
            )}
          </Card>

          <Card className="gap-3 p-5">
            <h2 className="m-0 text-[17px] font-semibold">{t.tasks}</h2>
            {req.tasks.length === 0 && <p className="m-0 text-sm text-muted">{t.tasksNone}</p>}
            {req.tasks.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 border-t border-divider pt-2 text-sm">
                <span className={cx(x.done && 'text-muted line-through')}>{x.done ? '✓ ' : '○ '}{x.title}</span>
                {status === 'FULFILLING' && canFulfil && (
                  <form action={toggleTaskAction.bind(null, req.id, x.id)}>
                    <button type="submit" aria-label={`${x.done ? 'เปิดงานอีกครั้ง' : t.taskDone}: ${x.title}`} className={`${btn} px-3 text-xs`}>{x.done ? '↺' : t.taskDone}</button>
                  </form>
                )}
              </div>
            ))}
            {status === 'FULFILLING' && canFulfil && (
              <>
                <form action={addTaskAction.bind(null, req.id)} className="flex flex-wrap items-end gap-2 border-t border-divider pt-3">
                  <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[13px] text-muted">{t.taskAdd}
                    <input name="title" required placeholder={t.taskPlaceholder} className={`${field} min-h-11`} />
                  </label>
                  <button type="submit" className="h-11 rounded-control bg-ink px-4 text-sm font-semibold text-white">{t.taskAdd}</button>
                </form>
                <div className="flex flex-wrap items-center gap-3">
                  <form action={deliverAction.bind(null, req.id)}><button type="submit" disabled={openTasks > 0} className={`${primary} disabled:cursor-not-allowed disabled:opacity-50`}>{t.deliver}</button></form>
                  <span className="text-xs text-muted">{t.deliverHint}</span>
                </div>
              </>
            )}
          </Card>
        </div>

        {!isFinished(status) && canFulfil && (
          <Card className="p-5">
            <form action={cancelRequestAction.bind(null, req.id)} className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{t.cancelLabel}
                <input name="reason" required className={`${field} min-h-11`} />
              </label>
              <button type="submit" className={`${btn} text-critical-fg`}>{t.cancel}</button>
            </form>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-semibold">{th.common.activity}</h2>
          <ActivityLog items={activity} empty={th.common.activityNone} />
        </Card>
      </div>
    </>
  );
}
