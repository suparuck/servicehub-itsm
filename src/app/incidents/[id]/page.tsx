import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Countdown } from '@/components/Countdown';
import { Card, PriorityChip, StatusBadge, cx } from '@/components/ui';
import { th } from '@/i18n/th';
import { db } from '@/lib/db';
import { thDateShort, thDateTime, thTime } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { allowedTransitions, type IncidentStatus } from '@/lib/incident';
import { getIncidentByDocNo } from '@/lib/incidentQueries';
import { formatTargetMinutes, timerView } from '@/lib/sla';
import { addNoteAction, changeStatusAction, createProblemAction, escalateAction } from '../actions';

export const dynamic = 'force-dynamic';

const DOT: Record<string, string> = {
  accent: 'bg-accent', ok: 'bg-ok', critical: 'bg-critical', ink: 'bg-ink', muted: 'bg-[#8C93A0]', neutral: 'bg-neutral',
};
const btn = 'inline-flex h-11 items-center rounded-control border border-input bg-surface px-4 text-sm text-ink no-underline hover:text-ink';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm';

export default async function IncidentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notes?: string }>;
}) {
  const { id: docParam } = await params;
  const sp = await searchParams;
  const inc = await getIncidentByDocNo(docParam);
  if (!inc) notFound();

  const t = th.incident;
  const no = formatDocNo('INC', inc.seq);
  const now = new Date();
  const closed = inc.status === 'CLOSED';
  const customerOnly = sp.notes === 'customer';
  const notes = customerOnly ? inc.notes.filter((n) => n.visibility === 'CUSTOMER') : inc.notes;
  const next = allowedTransitions(inc.status as IncidentStatus);

  const kb = await db.knowledgeArticle.findMany({
    where: inc.problemId
      ? { problemId: inc.problemId }
      : inc.service
        ? { title: { contains: inc.service.name, mode: 'insensitive' } }
        : { id: '' },
    orderBy: { views: 'desc' },
    take: 3,
  });

  const meta = [
    { k: t.meta.impact, v: th.level[inc.impact] },
    { k: t.meta.urgency, v: th.level[inc.urgency] },
    { k: t.meta.service, v: inc.service?.name ?? '—' },
    { k: t.meta.category, v: inc.category ?? '—' },
    { k: t.meta.group, v: inc.group?.name ?? '—' },
    { k: t.meta.assignee, v: inc.assignee?.name ?? t.unassigned },
    { k: t.meta.manager, v: inc.manager?.name ?? '—' },
    { k: t.meta.channel, v: inc.channel ?? '—' },
  ];

  const timers = (['RESPONSE', 'RESOLVE'] as const)
    .map((m) => inc.timers.find((x) => x.metric === m))
    .filter((x): x is NonNullable<typeof x> => !!x);

  const links = [
    inc.problem && { href: '/problems', id: formatDocNo('PRB', inc.problem.seq), kind: 'Problem', title: inc.problem.title },
    inc.change && { href: '/changes', id: formatDocNo('CHG', inc.change.seq), kind: `${th.changeType[inc.change.type]}`, title: inc.change.title },
    inc.parent && { href: `/incidents/${formatDocNo('INC', inc.parent.seq)}`, id: formatDocNo('INC', inc.parent.seq), kind: t.parent, title: inc.parent.title },
    ...inc.children.map((c) => ({ href: `/incidents/${formatDocNo('INC', c.seq)}`, id: formatDocNo('INC', c.seq), kind: 'Incident ลูก', title: c.title })),
  ].filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-3.5 bg-sidebar px-7 py-3.5 text-white">
        <Link href="/" className="flex min-h-[44px] items-center text-sm text-[#C9D5FB] no-underline hover:text-white">{t.back}</Link>
        <span className="text-[#6B727D]">/</span>
        <Link href="/incidents" className="flex min-h-[44px] items-center text-sm text-[#D9DCE1] no-underline hover:text-white">{t.breadcrumb}</Link>
        <span className="grow" />
        {inc.isMajor && <span className="text-[13px] text-[#A9AFB9]">{t.majorBar}</span>}
      </header>

      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && (
          <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>
        )}

        <Card className="gap-4 p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex min-w-[260px] grow flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-muted">{no}</span>
                <PriorityChip priority={inc.priority} className="self-auto" />
                {inc.isMajor && <span className="rounded-chip bg-ink px-2.5 py-[3px] text-xs font-semibold text-white">{th.dashboard.majorIncident}</span>}
                <StatusBadge tone={closed ? 'neutral' : inc.status === 'RESOLVED' ? 'ok' : 'accent'}>{th.incidentStatus[inc.status]}</StatusBadge>
              </div>
              <h1 className="m-0 text-[26px] leading-[1.3]">{inc.title}</h1>
              <span className="text-sm text-muted">{t.reportedVia(inc.channel ?? '—', thDateTime(inc.createdAt))}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {!inc.isMajor && !closed && (
                <form action={escalateAction.bind(null, inc.id)}><button type="submit" className={btn}>{t.escalate}</button></form>
              )}
              {!inc.problemId && (
                <form action={createProblemAction.bind(null, inc.id)}><button type="submit" className={btn}>{t.createProblem}</button></form>
              )}
              {!closed && <Link href={`/incidents/${no}/edit`} className={btn}>{t.edit}</Link>}
              {!closed && (
                <a href="#status-form" className="inline-flex h-11 items-center rounded-control bg-accent px-4 text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">
                  {t.resolveAnchor}
                </a>
              )}
            </div>
          </div>

          <ol aria-label={t.lifecycleAria} className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-5">
            {t.lifecycle.map((name, i) => {
              const n = i + 1;
              const cur = inc.lifecycleStep;
              return (
                <li key={n} aria-current={n === cur ? 'step' : undefined} className="flex flex-col gap-1.5">
                  <span className={cx('block h-1.5 rounded-[3px]', n < cur ? 'bg-ink' : n === cur ? 'bg-accent' : 'bg-border')} />
                  <span className={cx('text-[13px]', n === cur ? 'font-bold text-ink' : n < cur ? 'text-ink' : 'text-muted')}>{n}. {name}</span>
                </li>
              );
            })}
          </ol>

          <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-4">
            {meta.map((m) => (
              <div key={m.k} className="flex flex-col gap-0.5 rounded-control bg-subtle px-3 py-2.5">
                <dt className="text-xs text-muted">{m.k}</dt>
                <dd className="m-0 text-sm font-semibold">{m.v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="gap-2.5 p-5">
              <h2 className="m-0 text-[17px] font-semibold">{t.descTitle}</h2>
              <p className="m-0 whitespace-pre-line text-[15px] leading-[1.7]">{inc.description || <span className="text-muted">{t.noDesc}</span>}</p>
            </Card>

            {!closed && (
              <Card className="p-5">
                <h2 id="status-form" className="m-0 scroll-mt-6 text-[17px] font-semibold">{t.statusTitle}</h2>
                <form action={changeStatusAction.bind(null, inc.id)} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="status" className="text-[13px] text-muted">{t.statusNext}</label>
                    <select id="status" name="status" className={cx(field, 'min-h-11 sm:max-w-xs')}>
                      {next.map((s) => <option key={s} value={s}>{th.incidentStatus[s]}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="status-note" className="text-[13px] text-muted">{t.statusNote}</label>
                    <textarea id="status-note" name="note" rows={3} className={cx(field, 'py-3')} />
                  </div>
                  <button type="submit" className="h-11 self-start rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.statusSubmit}</button>
                </form>
              </Card>
            )}

            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <h2 className="m-0 text-[17px] font-semibold">{t.notesTitle}</h2>
                <nav aria-label="กรองบันทึก" className="flex gap-1.5">
                  {[{ k: undefined, label: t.notesAll }, { k: 'customer', label: t.notesCustomer }].map((f) => {
                    const active = (sp.notes ?? undefined) === f.k;
                    return (
                      <Link key={f.label} href={f.k ? `/incidents/${no}?notes=${f.k}` : `/incidents/${no}`} aria-current={active ? 'true' : undefined}
                        className={cx('inline-flex min-h-[44px] items-center rounded-full border px-3 text-[13px] no-underline',
                          active ? 'border-ink bg-ink text-white hover:text-white' : 'border-input bg-surface text-ink hover:text-ink')}>
                        {f.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <form action={addNoteAction.bind(null, inc.id)} className="flex flex-col gap-2">
                <label htmlFor="note" className="text-[13px] text-muted">{t.notesAdd}</label>
                <textarea id="note" name="body" required placeholder={t.notesPlaceholder} className={cx(field, 'min-h-[84px] resize-y p-3')} />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="visibility" value="INTERNAL" defaultChecked className="h-4 w-4" />{t.notesInternal}</label>
                  <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="visibility" value="CUSTOMER" className="h-4 w-4" />{t.notesVisible}</label>
                  <button type="submit" className="ml-auto h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{t.notesSubmit}</button>
                </div>
              </form>

              {notes.length === 0 && <p className="m-0 text-sm text-muted">{t.notesEmpty}</p>}
              {notes.map((n) => {
                const same = thDateShort(n.createdAt) === thDateShort(now);
                return (
                  <div key={n.id} className="grid grid-cols-[64px_14px_minmax(0,1fr)] gap-2.5 pt-2.5">
                    <span className="font-mono text-[13px] text-muted" title={thDateTime(n.createdAt)}>{same ? thTime(n.createdAt) : thDateShort(n.createdAt)}</span>
                    <span aria-hidden="true" className={cx('mt-1 h-3 w-3 rounded-full', DOT[n.tone] ?? DOT.neutral)} />
                    <div className="flex flex-col gap-0.5 border-b border-divider pb-2.5">
                      <span className="text-[13px] font-semibold">
                        {n.author?.name ?? n.authorLabel ?? 'ระบบ'} <span className="font-normal text-muted">· {n.kind}</span>
                        {n.visibility === 'CUSTOMER' && <StatusBadge tone="ok" className="ml-2 align-middle">{t.customerBadge}</StatusBadge>}
                      </span>
                      <span className="whitespace-pre-line text-sm leading-[1.6]">{n.body}</span>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Card className="gap-3.5 p-5">
              <h2 className="m-0 text-[17px] font-semibold">{t.slaTitle}</h2>
              {timers.length === 0 && <p className="m-0 text-sm text-muted">{t.slaNone}</p>}
              {timers.map((tm) => {
                const v = timerView(tm, now);
                const done = !!tm.achievedAt;
                const label = done ? (v.state === 'MET' ? t.slaState.MET : t.slaState.BREACHED) : v.state === 'PAUSED' ? t.slaState.PAUSED : v.state === 'BREACHED' ? t.slaState.BREACHED : v.near ? t.slaState.NEAR : t.slaState.OK;
                const warn = v.state === 'BREACHED' || v.near;
                const target = formatTargetMinutes(tm.targetMinutes);
                const usedMin = tm.achievedAt ? Math.max(0, Math.round((tm.achievedAt.getTime() - tm.startedAt.getTime()) / 60_000)) : 0;
                return (
                  <div key={tm.id} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[13px]">
                      <span>{tm.metric === 'RESPONSE' ? t.slaResponse : t.slaResolve}</span>
                      <span className={cx('font-semibold', warn ? 'text-critical-fg' : 'text-ok-fg')}>{label}</span>
                    </div>
                    {done ? (
                      <span className="font-mono text-[26px] font-bold">{t.slaAchieved}</span>
                    ) : (
                      <Countdown dueAtIso={tm.dueAt.toISOString()} paused={v.state === 'PAUSED'} leftMs={v.leftMs} className="font-mono text-[26px] font-bold" />
                    )}
                    <div className="h-2 rounded bg-divider" role="progressbar" aria-label={tm.metric === 'RESPONSE' ? t.slaResponse : t.slaResolve} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.pct)}>
                      <div className={cx('h-2 rounded', warn ? 'bg-critical' : 'bg-ok')} style={{ width: `${v.pct}%` }} />
                    </div>
                    <span className="text-xs text-muted">
                      {done ? t.slaTargetDone(target, `${usedMin} นาที`) : t.slaTarget(target, thTime(tm.dueAt) + ' น.')}
                      {v.state === 'PAUSED' && ` · ${t.slaPausedNote}`}
                    </span>
                  </div>
                );
              })}
            </Card>

            <Card className="gap-2.5 p-5">
              <h2 className="m-0 text-[17px] font-semibold">{t.ciTitle}</h2>
              <span className="-mt-1.5 text-xs text-muted">{t.ciSub}</span>
              {inc.cis.length === 0 && <p className="m-0 text-sm text-muted">{t.ciNone}</p>}
              {inc.cis.map(({ ci, role }) => {
                const hit = role === 'ได้รับผลกระทบ' || role === 'ต้นเหตุที่เป็นไปได้';
                return (
                  <div key={ci.id} className={cx('flex items-center justify-between gap-2.5 rounded-control border px-3 py-2.5', hit ? 'border-critical-line bg-critical-soft' : 'border-border bg-surface')}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">{ci.name}</span>
                      <span className="text-xs text-muted">{ci.classLabel ?? ci.ciClass}</span>
                    </div>
                    <span className="text-xs font-semibold">{role}</span>
                  </div>
                );
              })}
            </Card>

            <Card className="gap-2.5 p-5">
              <h2 className="m-0 text-[17px] font-semibold">{t.linksTitle}</h2>
              {links.length === 0 && <p className="m-0 text-sm text-muted">{t.linksNone}</p>}
              {links.map((l) => (
                <Link key={l.id} href={l.href} className="flex min-h-[44px] flex-col gap-0.5 rounded-control border border-border px-3 py-2.5 text-ink no-underline hover:text-ink">
                  <span className="text-xs text-muted"><span className="font-mono">{l.id}</span> · {l.kind}</span>
                  <span className="text-sm font-medium">{l.title}</span>
                </Link>
              ))}
            </Card>

            <section className="flex flex-col gap-2 rounded-card bg-accent-tint p-5">
              <h2 className="m-0 text-base font-semibold text-accent-hover">{t.kbTitle}</h2>
              {kb.length === 0 && <p className="m-0 text-sm text-accent-hover">{t.kbNone}</p>}
              {kb.map((a) => (
                <Link key={a.id} href="/knowledge" className="inline-flex min-h-[44px] items-center text-sm">
                  {formatDocNo('KB', a.seq)} · {a.title}
                </Link>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
