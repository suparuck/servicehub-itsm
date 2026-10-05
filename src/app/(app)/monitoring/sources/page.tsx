import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { CreateSourceForm, RotateTokenForm } from '@/components/SourceForms';
import { Card, StatusBadge } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateShort, thTime } from '@/lib/datetime';
import { listSources } from '@/lib/monitoringService';
import { appUrl } from '@/lib/mail/config';
import { can, type Role } from '@/lib/permissions';
import { updateSourceAction } from '../actions';

export const dynamic = 'force-dynamic';
const btn = 'h-11 rounded-control border border-input bg-surface px-4 text-sm';

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user.role as Role, 'monitoring.admin')) notFound();
  const [sources, activity] = await Promise.all([listSources(), getAudit('MONITORING', 'sources')]);
  const t = th.monitoring.sources;
  const endpoint = `${appUrl()}/api/monitoring/events`;
  const example = `curl -X POST ${endpoint} \\\n  -H "Authorization: Bearer shm_..." -H "Content-Type: application/json" \\\n  -d '{"check":"disk_full","severity":"critical","ci":"ERP-DB-02","service":"ERP","message":"ดิสก์เต็ม 98%"}'`;
  return (
    <>
      <PageHeader breadcrumb={<><Link href="/monitoring">{th.monitoring.title}</Link> › {t.title}</>} title={t.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1000px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        <p className="m-0 text-sm text-muted">{t.intro}</p>

        <Card className="gap-3 p-5">
          {sources.length === 0 ? <p className="m-0 text-sm text-muted">{t.none}</p> : (
            <ul className="m-0 flex list-none flex-col p-0" data-testid="sources">
              {sources.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 border-b border-divider py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{s.name}</strong>
                    <StatusBadge tone={s.active ? 'ok' : 'neutral'}>{s.active ? t.on : t.off}</StatusBadge>
                    <StatusBadge tone={s.autoIncident ? 'accent' : 'neutral'}>{s.autoIncident ? t.auto : t.autoOff}</StatusBadge>
                    <span className="text-xs text-muted">{s.lastEventAt ? t.lastEvent(`${thDateShort(s.lastEventAt)} ${thTime(s.lastEventAt)}`) : t.neverEvent} · {t.eventsCount(s._count.events)}</span>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <form action={updateSourceAction.bind(null, s.id, { active: !s.active })}><button type="submit" aria-label={`${s.active ? t.disable : t.enable} ${s.name}`} className={btn}>{s.active ? t.disable : t.enable}</button></form>
                    <form action={updateSourceAction.bind(null, s.id, { autoIncident: !s.autoIncident })}><button type="submit" aria-label={`${s.autoIncident ? t.autoDisable : t.autoOn} ${s.name}`} className={btn}>{s.autoIncident ? t.autoDisable : t.autoOn}</button></form>
                    <RotateTokenForm id={s.id} name={s.name} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-divider pt-3"><CreateSourceForm /></div>
        </Card>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.howTitle}</h2>
          <p className="m-0 text-sm">{t.howBody}</p>
          <p className="m-0 text-xs text-muted">{t.fields}</p>
          <pre className="m-0 overflow-x-auto whitespace-pre rounded-control bg-subtle p-3 font-mono text-xs" data-testid="curl">{example}</pre>
        </Card>

        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.activity}</h2>
          <ActivityLog items={activity} empty={th.common.activityNone} />
        </Card>
      </div>
    </>
  );
}
