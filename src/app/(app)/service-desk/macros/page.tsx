import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/currentUser';
import { can, type Role } from '@/lib/permissions';
import { listMacros } from '@/lib/serviceDeskService';
import { createMacroAction, deleteMacroAction, toggleMacroAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';
const btn = 'h-11 rounded-control border border-input bg-surface px-4 text-sm';

export default async function MacrosPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user.role as Role, 'servicedesk.manage')) notFound();
  const [macros, activity] = await Promise.all([listMacros(), getAudit('DESK', 'macros')]);
  const t = th.desk;
  const m = t.macros;
  const r = t.rules;
  return (
    <>
      <PageHeader breadcrumb={<><Link href="/service-desk">{t.title}</Link> › {m.title}</>} title={m.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1000px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        <p className="m-0 text-sm text-muted">{m.intro}</p>

        <Card className="gap-2 p-5">
          {macros.length === 0 ? <p className="m-0 text-sm text-muted">{m.none}</p> : (
            <ul className="m-0 flex list-none flex-col p-0" data-testid="macros">
              {macros.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider py-2 last:border-b-0">
                  <span className="flex min-w-0 grow basis-[260px] flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">{x.title}<StatusBadge tone={x.active ? 'ok' : 'neutral'}>{x.active ? r.on : r.off}</StatusBadge></span>
                    <span className="line-clamp-2 whitespace-pre-line text-xs text-muted">{x.body}</span>
                  </span>
                  <form action={toggleMacroAction.bind(null, x.id, !x.active)}><button type="submit" aria-label={`${x.active ? r.disable : r.enable} ${x.title}`} className={btn}>{x.active ? r.disable : r.enable}</button></form>
                  <form action={deleteMacroAction.bind(null, x.id)}><button type="submit" aria-label={`${r.remove} ${x.title}`} className={`${btn} text-critical-fg`}>{r.remove}</button></form>
                </li>
              ))}
            </ul>
          )}
          <form action={createMacroAction} className="flex flex-col gap-3 border-t border-divider pt-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_100px]">
              <label className="flex flex-col gap-1 text-xs text-muted">{m.name}<input name="title" required maxLength={80} className={field} /></label>
              <label className="flex flex-col gap-1 text-xs text-muted">{m.order}<input name="sortOrder" type="number" min={0} max={9999} defaultValue={0} className={field} /></label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted">{m.body}<textarea name="body" required rows={4} maxLength={2000} className={`${field} py-3`} /></label>
            <button type="submit" className="h-11 self-start rounded-control bg-ink px-5 text-sm font-semibold text-white">{m.add}</button>
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
