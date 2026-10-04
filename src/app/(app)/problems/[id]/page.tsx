import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { Card, PriorityChip, StatusBadge, cx, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import { bangkokYmd } from '@/lib/change';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { formatDocNo, parseDocNo } from '@/lib/docno';
import { PHASES, nextPhases, type ProblemPhase } from '@/lib/problem';
import { can, type Role } from '@/lib/permissions';
import { createChangeAction, createKbAction, linkIncidentAction, transitionAction, unlinkIncidentAction, updateProblemAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm';
const btn = 'inline-flex h-11 items-center rounded-control border border-input bg-surface px-4 text-sm text-ink no-underline hover:text-ink';
const PHASE_TONE: Record<ProblemPhase, Tone> = { IDENTIFICATION: 'neutral', CONTROL: 'accent', ERROR_CONTROL: 'warn', KNOWN_ERROR: 'warn', RESOLVED: 'ok' };

export default async function ProblemDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id: docParam } = await params;
  const sp = await searchParams;
  const seq = parseDocNo('PRB', decodeURIComponent(docParam));
  if (seq === null) notFound();
  const problem = await db.problem.findUnique({
    where: { seq },
    include: {
      incidents: { orderBy: { seq: 'desc' }, include: { service: true } },
      articles: { orderBy: { seq: 'desc' } },
      changes: { orderBy: { seq: 'desc' } },
    },
  });
  if (!problem) notFound();
  const [user, activity] = await Promise.all([getCurrentUser(), getAudit('PROBLEM', problem.id)]);
  const t = th.problem;
  const canEdit = can(user?.role as Role, 'problem.manage');
  const next = nextPhases(problem.phase);
  const phaseIdx = PHASES.indexOf(problem.phase);
  const no = formatDocNo('PRB', problem.seq);
  const openInc = problem.incidents.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status)).length;

  return (
    <>
      <PageHeader breadcrumb={<><Link href="/problems">{t.title}</Link> › {no}</>} title={problem.title} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        {!canEdit && <div role="status" className="rounded-control bg-accent-tint px-3 py-2.5 text-sm text-accent-hover">{th.common.noPermission}</div>}

        <Card className="gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm text-muted">{no}</span>
            <StatusBadge tone={PHASE_TONE[problem.phase]} className="px-2.5 py-1 text-xs">{problem.phaseLabel ?? th.problemPhase[problem.phase]}</StatusBadge>
            <span className="text-xs text-muted">{th.problem.incidentsTitle}: {problem.incidents.length} ({t.open(openInc)})</span>
          </div>
          <ol aria-label={t.transitionTitle} className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-5">
            {PHASES.map((p, i) => (
              <li key={p} aria-current={i === phaseIdx ? 'step' : undefined} className="flex flex-col gap-1.5">
                <span className={cx('block h-1.5 rounded-[3px]', i < phaseIdx ? 'bg-ink' : i === phaseIdx ? 'bg-accent' : 'bg-border')} />
                <span className={cx('text-[13px]', i === phaseIdx ? 'font-bold' : i > phaseIdx ? 'text-muted' : '')}>{i + 1}. {t.phases[i]}</span>
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="p-5">
              <form action={updateProblemAction.bind(null, problem.id)} className="flex flex-col gap-3">
                <fieldset disabled={!canEdit} className="m-0 flex flex-col gap-3 border-0 p-0">
                  <label className="flex flex-col gap-1.5 text-[13px] font-medium">{th.problem.form.title}
                    <input name="title" required maxLength={200} defaultValue={problem.title} className={`${field} min-h-11`} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-[13px] font-medium">{th.problem.form.description}
                    <textarea name="description" rows={3} defaultValue={problem.description ?? ''} className={`${field} py-3`} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.rootCause}
                    <textarea name="rootCause" rows={3} defaultValue={problem.rootCause ?? ''} className={`${field} py-3`} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.workaround}
                    <textarea name="workaround" rows={3} defaultValue={problem.workaround ?? ''} className={`${field} py-3`} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.targetDate}
                    <input type="date" name="targetDate" defaultValue={problem.targetDate ? bangkokYmd(problem.targetDate) : ''} className={`${field} min-h-11 sm:max-w-xs`} />
                    <span className="text-xs font-normal text-muted">{t.targetDateHint}</span>
                  </label>
                  {canEdit && <button type="submit" className="h-11 self-start rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{t.saveDetails}</button>}
                </fieldset>
              </form>
            </Card>

            {canEdit && (
              <Card className="p-5">
                <h2 className="m-0 text-[17px] font-semibold">{t.transitionTitle}</h2>
                {next.length === 0 ? <p className="m-0 text-sm text-muted">{t.transitionNone}</p> : (
                  <form action={transitionAction.bind(null, problem.id)} className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1.5 text-[13px] text-muted">{t.transitionNext}
                      <select name="phase" className={`${field} min-h-11 sm:max-w-xs`}>
                        {next.map((p) => <option key={p} value={p}>{th.problemPhase[p]}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-[13px] text-muted">{t.transitionNote}
                      <textarea name="note" rows={2} className={`${field} py-3`} />
                    </label>
                    <button type="submit" className="h-11 self-start rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.transitionSubmit}</button>
                  </form>
                )}
              </Card>
            )}

            <Card className="p-5">
              <h2 className="m-0 text-[17px] font-semibold">{th.common.activity}</h2>
              <ActivityLog items={activity} empty={th.common.activityNone} />
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Card className="gap-2.5 p-5">
              <h2 className="m-0 text-[17px] font-semibold">{t.incidentsTitle}</h2>
              {problem.incidents.length === 0 && <p className="m-0 text-sm text-muted">{t.incidentsNone}</p>}
              {problem.incidents.map((i) => (
                <div key={i.id} className="flex items-start justify-between gap-2 rounded-control border border-border p-2.5">
                  <Link href={`/incidents/${formatDocNo('INC', i.seq)}`} className="flex min-h-[44px] min-w-0 flex-col justify-center text-ink no-underline hover:text-ink">
                    <span className="flex items-center gap-2 text-xs text-muted"><span className="font-mono">{formatDocNo('INC', i.seq)}</span><PriorityChip priority={i.priority} className="px-2 py-0 text-[11px]" /></span>
                    <span className="text-sm font-medium">{i.title}</span>
                  </Link>
                  {canEdit && (
                    <form action={unlinkIncidentAction.bind(null, problem.id, i.id)}>
                      <button type="submit" aria-label={`${t.unlink} ${formatDocNo('INC', i.seq)}`} className="h-11 rounded-control border border-input bg-surface px-3 text-xs text-critical-fg">{t.unlink}</button>
                    </form>
                  )}
                </div>
              ))}
              {canEdit && (
                <form action={linkIncidentAction.bind(null, problem.id)} className="flex flex-wrap items-end gap-2 pt-1">
                  <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[13px] text-muted">{t.linkLabel}
                    <input name="incident" required placeholder="INC-24817" className={`${field} min-h-11`} />
                  </label>
                  <button type="submit" className="h-11 rounded-control bg-ink px-4 text-sm font-semibold text-white">{t.linkBtn}</button>
                </form>
              )}
            </Card>

            <Card className="gap-2 p-5">
              <h2 className="m-0 text-[17px] font-semibold">{t.kbTitle}</h2>
              {problem.articles.length === 0 && <p className="m-0 text-sm text-muted">{t.kbNone}</p>}
              {problem.articles.map((a) => (
                <Link key={a.id} href={`/knowledge/${formatDocNo('KB', a.seq)}`} className="flex min-h-[44px] items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted">{formatDocNo('KB', a.seq)}</span> {a.title}
                  {a.status === 'DRAFT' && <StatusBadge tone="warn">ร่าง</StatusBadge>}
                </Link>
              ))}
              {canEdit && (
                <form action={createKbAction.bind(null, problem.id)}><button type="submit" className={btn}>{t.kbCreate}</button></form>
              )}
            </Card>

            <Card className="gap-2 p-5">
              <h2 className="m-0 text-[17px] font-semibold">{t.changesTitle}</h2>
              {problem.changes.length === 0 && <p className="m-0 text-sm text-muted">{t.changesNone}</p>}
              {problem.changes.map((c) => (
                <Link key={c.id} href={`/changes/${formatDocNo('CHG', c.seq)}`} className="flex min-h-[44px] flex-col justify-center text-sm">
                  <span><span className="font-mono text-xs text-muted">{formatDocNo('CHG', c.seq)}</span> · {th.changeType[c.type]}</span>
                  <span className="font-medium">{c.title}</span>
                </Link>
              ))}
              {can(user?.role as Role, 'change.create') && (
                <form action={createChangeAction.bind(null, problem.id)}><button type="submit" className={btn}>{t.changeCreate}</button></form>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
