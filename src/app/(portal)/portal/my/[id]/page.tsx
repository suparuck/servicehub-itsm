import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PortalPage, SurveyForm, portalField } from '@/components/portalBits';
import { StatusBadge, cx } from '@/components/ui';
import { th } from '@/i18n/th';
import { thDateTime } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { incidentBars } from '@/lib/portal';
import { getOwnedItem, getPortalUser } from '@/lib/portalService';
import { confirmResolvedAction, reopenAction, replyAction, surveyAction } from '../../actions';

export const dynamic = 'force-dynamic';

const card = 'flex flex-col gap-3 rounded-card border border-border bg-surface p-5';

export default async function PortalItem({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getPortalUser();
  if (!user) notFound();
  const item = await getOwnedItem(user.id, id);
  if (!item) notFound();
  const p = th.portal;
  const d = p.detail;

  const isInc = item.kind === 'INC';
  const docNo = isInc ? formatDocNo('INC', item.inc.seq) : formatDocNo('REQ', item.req.seq);
  const title = isInc ? item.inc.title : item.req.title;
  const created = isInc ? item.inc.createdAt : item.req.createdAt;
  const state = isInc ? p.incidentState[item.inc.status] : p.requestState[item.req.status];
  const steps = isInc ? p.incidentSteps : p.requestSteps;
  const bars = isInc ? incidentBars(item.inc.status) : item.req.stage;
  const finished = isInc ? item.inc.status === 'CLOSED' : ['DELIVERED', 'REJECTED', 'CANCELLED'].includes(item.req.status);
  const survey = isInc ? item.inc.survey : item.req.survey;
  const canRate = !survey && (isInc ? item.inc.status === 'CLOSED' : item.req.status === 'DELIVERED');
  const description = isInc ? item.inc.description : item.req.description;

  return (
    <PortalPage className="max-w-[860px]">
      <Link href="/portal/my" className="inline-flex min-h-[44px] items-center self-start text-sm">{d.back}</Link>
      {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}

      <section className={card}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-sm text-muted">{docNo}</span>
          <StatusBadge tone={finished ? 'neutral' : isInc && item.inc.status === 'PENDING_USER' ? 'warn' : isInc && item.inc.status === 'RESOLVED' ? 'ok' : 'accent'} className="px-2.5 py-1 text-xs">{state}</StatusBadge>
        </div>
        <h1 className="m-0 text-2xl font-bold leading-snug">{title}</h1>
        <span className="text-sm text-muted">{d.reportedAt(thDateTime(created))}</span>
        <ol aria-label={d.progress} className="m-0 grid list-none grid-cols-4 gap-1.5 p-0">
          {steps.map((s, i) => (
            <li key={s} aria-current={i + 1 === bars ? 'step' : undefined} className="flex flex-col gap-1.5">
              <span className={cx('block h-1.5 rounded-[3px]', i < bars ? 'bg-accent' : 'bg-border')} />
              <span className={cx('text-[13px]', i + 1 === bars ? 'font-bold' : i < bars ? '' : 'text-muted')}>{i + 1}. {s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={card}>
        <h2 className="m-0 text-[17px] font-semibold">{d.details}</h2>
        <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5 rounded-control bg-subtle px-3 py-2.5">
            <dt className="text-xs text-muted">{isInc ? d.service : d.catalog}</dt>
            <dd className="m-0 text-sm font-semibold">{(isInc ? item.inc.service?.name : item.req.catalog?.name) ?? '—'}</dd>
          </div>
        </dl>
        {description && <p className="m-0 whitespace-pre-line text-[15px] leading-[1.7]">{description}</p>}
      </section>

      {!isInc && (
        <section className={card}>
          <h2 className="m-0 text-[17px] font-semibold">{d.approvals}</h2>
          {item.req.approvals.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 border-t border-divider pt-2 text-sm">
              <span>{a.approver}</span>
              <StatusBadge tone={a.decision === 'APPROVED' ? 'ok' : a.decision === 'REJECTED' ? 'critical' : 'warn'}>
                {a.decision === 'APPROVED' ? d.approvalApproved : a.decision === 'REJECTED' ? d.approvalRejected : d.approvalPending}
              </StatusBadge>
            </div>
          ))}
          {item.req.tasks.length > 0 && (
            <>
              <h3 className="m-0 mt-2 text-[15px] font-semibold">{d.tasks}</h3>
              {item.req.tasks.map((t) => <span key={t.id} className="text-sm">{t.done ? '✓' : '○'} {t.title}</span>)}
            </>
          )}
          <span className="text-xs text-muted">{item.req.nextNote}</span>
        </section>
      )}

      {isInc && (
        <>
          {item.inc.status === 'RESOLVED' && (
            <section className="flex flex-col gap-3 rounded-card border border-ok bg-ok-tint p-5">
              <h2 className="m-0 text-[17px] font-semibold text-ok-fg">{d.resolvedTitle}</h2>
              <span className="text-sm text-ok-fg">{d.resolvedAsk}</span>
              <div className="flex flex-wrap items-end gap-3">
                <form action={confirmResolvedAction.bind(null, docNo)}>
                  <button type="submit" className="h-11 rounded-control bg-ok px-5 text-sm font-semibold text-white">{d.confirm}</button>
                </form>
                <form action={reopenAction.bind(null, docNo)} className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[220px] flex-col gap-1 text-[13px] text-ok-fg">{d.reopenNote}
                    <input name="reason" className={portalField} />
                  </label>
                  <button type="submit" className="h-11 rounded-control border border-input bg-surface px-5 text-sm">{d.reopen}</button>
                </form>
              </div>
            </section>
          )}

          <section className={card}>
            <h2 className="m-0 text-[17px] font-semibold">{d.updates}</h2>
            {item.inc.notes.length === 0 && <p className="m-0 text-sm text-muted">{d.updatesNone}</p>}
            {item.inc.notes.map((n) => {
              const mine = n.authorId === user.id;
              return (
                <div key={n.id} className="grid grid-cols-[14px_minmax(0,1fr)] gap-3 border-t border-divider pt-3">
                  <span aria-hidden="true" className={cx('mt-1.5 h-3 w-3 rounded-full', mine ? 'bg-accent' : 'bg-ok')} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold">{mine ? d.you : d.team} <span className="font-normal text-muted">· {thDateTime(n.createdAt)}</span></span>
                    <span className="whitespace-pre-line text-sm leading-relaxed">{n.body}</span>
                  </div>
                </div>
              );
            })}
            {!finished && (
              <form action={replyAction.bind(null, docNo)} className="flex flex-col gap-2 border-t border-divider pt-3">
                <label htmlFor="body" className="text-[13px] font-medium">{d.reply}</label>
                <textarea id="body" name="body" required rows={3} placeholder={d.replyPlaceholder} className={`${portalField} py-3`} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted">{isInc && item.inc.status === 'PENDING_USER' ? d.replyNote : ''}</span>
                  <button type="submit" className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{d.replySend}</button>
                </div>
              </form>
            )}
          </section>
        </>
      )}

      {(canRate || survey) && (
        <section className={card}>
          <h2 className="m-0 text-[17px] font-semibold">{p.rateTitle}</h2>
          {survey ? <span role="status" className="text-sm text-ok-fg">{p.rateThanks} · {survey.score}/5</span> : <SurveyForm action={surveyAction.bind(null, docNo)} />}
        </section>
      )}
    </PortalPage>
  );
}
