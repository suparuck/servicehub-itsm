import Link from 'next/link';
import { PortalPage } from '@/components/portalBits';
import { th } from '@/i18n/th';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function PortalCatalog() {
  const items = await db.catalogItem.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' } });
  const p = th.portal;
  return (
    <PortalPage>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold">{p.catalogTitle}</h1>
        <span className="text-sm text-muted">{p.catalogSub}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <Link key={c.id} href={`/portal/request/new?item=${c.id}`} className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4 text-ink no-underline hover:border-accent hover:text-ink">
            <span className="text-[15px] font-semibold">{c.name}</span>
            <span className="text-[13px] leading-normal text-muted">{c.items}</span>
            <span className="text-xs font-semibold text-ok-fg">{c.slaText}</span>
          </Link>
        ))}
      </div>
    </PortalPage>
  );
}
