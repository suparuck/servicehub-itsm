import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import { formatMinutes } from '@/lib/catalogue';
import { getServiceDetail, listSlas } from '@/lib/catalogueService';
import { openEventsForService } from '@/lib/monitoringService';
import { getCurrentUser } from '@/lib/currentUser';
import { thDay, thMonthShort, thWindow } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';
import { addCatalogItemAction, addOfferingAction, removeCatalogItemAction, removeOfferingAction, setPublishedAction, updateCatalogItemAction, updateServiceAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';
const HEALTH_TONE: Record<string, Tone> = { OK: 'ok', DEGRADED: 'warn', DOWN: 'critical' };
const btn = 'h-11 rounded-control border border-input bg-surface px-4 text-sm';

export default async function ServiceDetail({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ error?: string }> }) {
  const { code: raw } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const detail = await getServiceDetail(decodeURIComponent(raw));
  if (!detail) notFound();
  const { service: s, incidents, changes } = detail;
  const [slas, activity, events] = await Promise.all([listSlas(), getAudit('SERVICE', s.id), openEventsForService(s.code)]);
  const manage = can(user.role as Role, 'catalogue.manage');
  const t = th.catalogue;
  const f = t.form;
  const target = (p: string, m: 'RESPONSE' | 'RESOLVE') => s.sla?.targets.find((x) => x.priority === p && x.metric === m)?.minutes;

  return (
    <>
      <PageHeader breadcrumb={<><Link href="/catalogue">{t.title}</Link> › {s.code}</>} title={s.name} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1100px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}

        <Card className="gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm text-muted">{s.code}</span>
            <StatusBadge tone={HEALTH_TONE[s.health]} className="px-2.5 py-1 text-xs">{t.health[s.health]}</StatusBadge>
            <span className="text-xs text-muted">{t.healthNote}</span>
          </div>
          <form action={updateServiceAction.bind(null, s.code)} className="flex flex-col gap-3">
            <fieldset disabled={!manage} className="m-0 flex flex-col gap-3 border-0 p-0">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.name}
                <input name="name" required maxLength={100} defaultValue={s.name} className={field} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.fullName}
                <input name="fullName" maxLength={150} defaultValue={s.fullName ?? ''} className={field} />
              </label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.category}
                  <input name="category" maxLength={80} defaultValue={s.category ?? ''} className={field} />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.owner}
                  <input name="ownerName" maxLength={100} defaultValue={s.ownerName ?? ''} className={field} />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.sla}
                  <select name="slaId" defaultValue={s.slaId ?? ''} className={field}>
                    <option value="">{f.none}</option>
                    {slas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.sortOrder}
                  <input name="sortOrder" type="number" min={0} max={9999} defaultValue={s.sortOrder} className={field} />
                </label>
              </div>
              {manage && <button type="submit" className="h-11 self-start rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{f.save}</button>}
            </fieldset>
          </form>
        </Card>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.eventsTitle}</h2>
          {events.length === 0 ? <p className="m-0 text-sm text-muted">{t.eventsNone}</p> : (
            <ul className="m-0 flex list-none flex-col p-0" data-testid="health-events">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider py-1.5 text-sm last:border-b-0">
                  <StatusBadge tone={e.severity === 'CRITICAL' ? 'critical' : e.severity === 'WARNING' ? 'warn' : 'neutral'} className="text-xs">{th.monitoring.severity[e.severity]}</StatusBadge>
                  <span className="font-medium">{e.check}</span>
                  {e.ciRef && <span className="text-xs text-muted">{e.ciRef}</span>}
                  <span className="text-xs text-muted">{th.monitoring.times(e.occurrences)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/monitoring?service=${encodeURIComponent(s.code)}`} className="inline-flex min-h-11 items-center self-start text-sm">{t.eventsAll}</Link>
        </Card>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.slaTitle}</h2>
          {s.sla ? (
            <>
              <span className="text-xs text-muted">{s.sla.name} · {t.slaCalendar(s.sla.calendar)}</span>
              <table className="w-full max-w-[520px] border-collapse text-left text-sm">
                <caption className="sr-only">{t.slaTitle}</caption>
                <thead><tr className="border-b border-border text-xs text-muted"><th scope="col" className="py-2 pr-3 font-medium">{t.slaPriority}</th><th scope="col" className="py-2 pr-3 font-medium">{t.slaResponse}</th><th scope="col" className="py-2 font-medium">{t.slaResolve}</th></tr></thead>
                <tbody>
                  {(['P1', 'P2', 'P3', 'P4'] as const).map((p) => (
                    <tr key={p} className="border-b border-divider">
                      <th scope="row" className="py-2 pr-3 text-left font-medium">{th.priority[p]}</th>
                      <td className="py-2 pr-3 font-mono text-[13px]">{target(p, 'RESPONSE') ? formatMinutes(target(p, 'RESPONSE')!) : '—'}</td>
                      <td className="py-2 font-mono text-[13px]">{target(p, 'RESOLVE') ? formatMinutes(target(p, 'RESOLVE')!) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <p className="m-0 text-sm text-muted">{t.slaNone}</p>}
        </Card>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.detailOffering}</h2>
          {s.offerings.length === 0 ? <p className="m-0 text-sm text-muted">{t.offeringsNone}</p> : (
            <ul className="m-0 flex list-none flex-col p-0" data-testid="offerings">
              {s.offerings.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider py-2 last:border-b-0">
                  <span className="flex min-w-0 grow basis-[240px] flex-col"><span className="text-sm font-medium">{o.name}</span>{o.description && <span className="text-xs text-muted">{o.description}</span>}</span>
                  {manage && (
                    <form action={removeOfferingAction.bind(null, s.code, o.id)}>
                      <button type="submit" aria-label={`${t.remove} ${o.name}`} className={`${btn} text-critical-fg`}>{t.remove}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {manage && (
            <form action={addOfferingAction.bind(null, s.code)} className="flex flex-wrap items-end gap-3 pt-2">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-[13px] font-medium">{t.offeringName}
                <input name="name" required maxLength={120} className={field} />
              </label>
              <label className="flex min-w-[240px] flex-[2] flex-col gap-1.5 text-[13px] font-medium">{t.offeringDesc}
                <input name="description" maxLength={400} className={field} />
              </label>
              <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.offeringAdd}</button>
            </form>
          )}
        </Card>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.itemsTitle}</h2>
          {s.catalogItems.length === 0 && <p className="m-0 text-sm text-muted">{t.itemsNone}</p>}
          <ul className="m-0 flex list-none flex-col gap-3 p-0" data-testid="items">
            {s.catalogItems.map((it) => (
              <li key={it.id} className="flex flex-col gap-2 rounded-control border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{it.name}</strong>
                  <StatusBadge tone={it.published ? 'ok' : 'neutral'}>{it.published ? t.published : t.hidden}</StatusBadge>
                  <span className="text-xs text-muted">{t.requestsCount(it._count.requests)}</span>
                </div>
                {manage ? (
                  <>
                    <form action={updateCatalogItemAction.bind(null, s.code, it.id)} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1.2fr_1.6fr_1fr_90px_auto]">
                      <label className="flex flex-col gap-1 text-xs text-muted">{t.itemName}<input name="name" required maxLength={100} defaultValue={it.name} className={field} /></label>
                      <label className="flex flex-col gap-1 text-xs text-muted">{t.itemExamples}<input name="items" required maxLength={200} defaultValue={it.items} className={field} /></label>
                      <label className="flex flex-col gap-1 text-xs text-muted">{t.itemSla}<input name="slaText" required maxLength={80} defaultValue={it.slaText} className={field} /></label>
                      <label className="flex flex-col gap-1 text-xs text-muted">{f.sortOrder}<input name="sortOrder" type="number" min={0} max={9999} defaultValue={it.sortOrder} className={field} /></label>
                      <button type="submit" aria-label={`${t.itemSave} ${it.name}`} className={btn}>{t.itemSave}</button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      <form action={setPublishedAction.bind(null, s.code, it.id, !it.published)}>
                        <button type="submit" aria-label={`${it.published ? t.hide : t.publish} ${it.name}`} className={btn}>{it.published ? t.hide : t.publish}</button>
                      </form>
                      <form action={removeCatalogItemAction.bind(null, s.code, it.id)}>
                        <button type="submit" aria-label={`${t.remove} ${it.name}`} className={`${btn} text-critical-fg`}>{t.remove}</button>
                      </form>
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-muted">{it.items} · {it.slaText}</span>
                )}
              </li>
            ))}
          </ul>
          {manage && (
            <form action={addCatalogItemAction.bind(null, s.code)} className="grid grid-cols-1 items-end gap-3 border-t border-divider pt-3 md:grid-cols-[1.2fr_1.6fr_1fr_90px_auto]">
              <label className="flex flex-col gap-1 text-xs text-muted">{t.itemName}<input name="name" required maxLength={100} className={field} /></label>
              <label className="flex flex-col gap-1 text-xs text-muted">{t.itemExamples}<input name="items" required maxLength={200} className={field} /></label>
              <label className="flex flex-col gap-1 text-xs text-muted">{t.itemSla}<input name="slaText" required maxLength={80} className={field} /></label>
              <label className="flex flex-col gap-1 text-xs text-muted">{f.sortOrder}<input name="sortOrder" type="number" min={0} max={9999} defaultValue={0} className={field} /></label>
              <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.itemAdd}</button>
            </form>
          )}
        </Card>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.relatedTitle}</h2>
          {incidents.length + changes.length === 0 ? <p className="m-0 text-sm text-muted">{t.relatedNone}</p> : (
            <ul className="m-0 flex list-none flex-col p-0" data-testid="related-work">
              {incidents.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 border-b border-divider py-1 last:border-b-0">
                  <Link href={`/incidents/${formatDocNo('INC', i.seq)}`} className="inline-flex min-h-11 items-center font-mono text-[13px]">{formatDocNo('INC', i.seq)}</Link>
                  <span className="text-sm">{i.title}</span>
                  <StatusBadge tone="neutral">{th.priority[i.priority]}</StatusBadge>
                </li>
              ))}
              {changes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 border-b border-divider py-1 last:border-b-0">
                  <Link href={`/changes/${formatDocNo('CHG', c.seq)}`} className="inline-flex min-h-11 items-center font-mono text-[13px]">{formatDocNo('CHG', c.seq)}</Link>
                  <span className="text-sm">{c.title}</span>
                  <StatusBadge tone="accent">{th.changeType[c.type]}</StatusBadge>
                  <span className="text-xs text-muted">{thDay(c.windowStart)} {thMonthShort(c.windowStart)} · {thWindow(c.windowStart, null)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.activity}</h2>
          <ActivityLog items={activity} empty={th.common.activityNone} />
        </Card>
        <Link href="/catalogue" className="inline-flex min-h-[44px] items-center self-start">{t.back}</Link>
      </div>
    </>
  );
}
