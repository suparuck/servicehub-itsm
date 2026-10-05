import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/currentUser';
import { can, type Role } from '@/lib/permissions';
import { listRules, ruleOptions } from '@/lib/serviceDeskService';
import { createRuleAction, deleteRuleAction, toggleRuleAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';
const btn = 'h-11 rounded-control border border-input bg-surface px-4 text-sm';

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user.role as Role, 'servicedesk.manage')) notFound();
  const [rules, opts, activity] = await Promise.all([listRules(), ruleOptions(), getAudit('DESK', 'rules')]);
  const t = th.desk;
  const r = t.rules;
  return (
    <>
      <PageHeader breadcrumb={<><Link href="/service-desk">{t.title}</Link> › {r.title}</>} title={r.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1000px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        <p className="m-0 text-sm text-muted">{r.intro}</p>

        <Card className="gap-2 p-5">
          {rules.length === 0 ? <p className="m-0 text-sm text-muted">{r.none}</p> : (
            <ul className="m-0 flex list-none flex-col p-0" data-testid="rules">
              {rules.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider py-2 last:border-b-0">
                  <span className="flex min-w-0 grow basis-[260px] flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">{x.name}<StatusBadge tone={x.active ? 'ok' : 'neutral'}>{x.active ? r.on : r.off}</StatusBadge></span>
                    <span className="text-xs text-muted">{x.service?.name ?? r.anyService} → {x.group.name}{x.assignee ? ` / ${x.assignee.name}` : ''} · {r.order} {x.sortOrder}</span>
                  </span>
                  <form action={toggleRuleAction.bind(null, x.id, !x.active)}><button type="submit" aria-label={`${x.active ? r.disable : r.enable} ${x.name}`} className={btn}>{x.active ? r.disable : r.enable}</button></form>
                  <form action={deleteRuleAction.bind(null, x.id)}><button type="submit" aria-label={`${r.remove} ${x.name}`} className={`${btn} text-critical-fg`}>{r.remove}</button></form>
                </li>
              ))}
            </ul>
          )}
          <form action={createRuleAction} className="grid grid-cols-1 items-end gap-3 border-t border-divider pt-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_80px_auto]">
            <label className="flex flex-col gap-1 text-xs text-muted">{r.name}<input name="name" required maxLength={100} className={field} /></label>
            <label className="flex flex-col gap-1 text-xs text-muted">{r.service}
              <select name="serviceId" defaultValue="" className={field}><option value="">{r.anyService}</option>{opts.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">{r.group}
              <select name="groupId" required defaultValue="" className={field}><option value="" disabled>—</option>{opts.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">{r.assignee}
              <select name="assigneeId" defaultValue="" className={field}><option value="">—</option>{opts.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">{r.order}<input name="sortOrder" type="number" min={0} max={9999} defaultValue={0} className={field} /></label>
            <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{r.add}</button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-semibold">{r.activity}</h2>
          <ActivityLog items={activity} empty={th.common.activityNone} />
        </Card>
      </div>
    </>
  );
}
