import Link from 'next/link';
import { MineCard, PortalPage } from '@/components/portalBits';
import { th } from '@/i18n/th';
import { getMine, getPortalUser } from '@/lib/portalService';

export const dynamic = 'force-dynamic';

export default async function PortalMine() {
  const user = await getPortalUser();
  const items = user ? await getMine(user.id) : [];
  const p = th.portal;
  const active = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  return (
    <PortalPage>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-bold">{p.mineTitle}</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/incident/new" className="inline-flex h-11 items-center rounded-control bg-accent px-4 text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{p.quick[0].title}</Link>
          <Link href="/portal/catalog" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-4 text-sm text-ink no-underline hover:text-ink">{p.quick[1].title}</Link>
        </div>
      </div>
      {items.length === 0 && <p className="m-0 rounded-card border border-border bg-surface p-4 text-sm text-muted">{p.mineEmptyAll}</p>}
      {active.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {active.map((m) => <MineCard key={m.key} item={m} />)}
        </div>
      )}
      {done.length > 0 && (
        <>
          <h2 className="m-0 text-xl font-semibold">{p.requestState.DELIVERED} / {p.incidentState.CLOSED}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {done.map((m) => <MineCard key={m.key} item={m} />)}
          </div>
        </>
      )}
    </PortalPage>
  );
}
