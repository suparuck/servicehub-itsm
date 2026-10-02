import { PortalPage } from '@/components/portalBits';
import { cx } from '@/components/ui';
import { th } from '@/i18n/th';
import { db } from '@/lib/db';
import { thDateTime } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

const HEALTH = {
  OK: { text: 'text-ok-fg', icon: 'h-2 w-2 rounded-full bg-ok' },
  DEGRADED: { text: 'text-warn-fg', icon: 'h-0 w-0 border-x-[5px] border-b-[9px] border-x-transparent border-b-warn' },
  DOWN: { text: 'text-critical-fg', icon: 'h-[9px] w-[9px] bg-critical' },
} as const;

export default async function PortalStatus() {
  const p = th.portal.status;
  const services = await db.service.findMany({ orderBy: { sortOrder: 'asc' }, take: 6 });
  const notes = await db.workNote.findMany({
    where: { visibility: 'CUSTOMER', incident: { status: { notIn: ['RESOLVED', 'CLOSED'] } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { incident: { include: { service: true } } },
  });
  return (
    <PortalPage className="max-w-[760px]">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold">{p.title}</h1>
        <span className="text-sm text-muted">{p.sub}</span>
      </div>
      <div className="rounded-card border border-border bg-surface px-4 py-1">
        {services.map((s) => (
          <div key={s.id} className="flex min-h-[44px] items-center justify-between gap-2.5 border-b border-divider py-2 last:border-b-0">
            <span className="text-sm">{s.name}</span>
            <span className={cx('inline-flex items-center gap-1.5 text-[13px] font-semibold', HEALTH[s.health].text)}>
              <span aria-hidden="true" className={HEALTH[s.health].icon} />
              {th.serviceHealth[s.health]}
            </span>
          </div>
        ))}
      </div>
      <h2 className="m-0 text-xl font-semibold">{p.updates}</h2>
      {notes.length === 0 && <p className="m-0 text-sm text-muted">{p.noUpdate}</p>}
      {notes.map((n) => (
        <div key={n.id} className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
          <span className="text-xs text-muted">{n.incident.service?.name} · {thDateTime(n.createdAt)}</span>
          <span className="text-sm leading-relaxed">{n.body}</span>
        </div>
      ))}
    </PortalPage>
  );
}
