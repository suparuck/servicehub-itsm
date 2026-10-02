import Link from 'next/link';
import { PortalPage, portalField } from '@/components/portalBits';
import { th } from '@/i18n/th';
import { formatDocNo } from '@/lib/docno';
import { searchPortal } from '@/lib/portalService';

export const dynamic = 'force-dynamic';

export default async function PortalSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim();
  const p = th.portal;
  const { catalog, articles } = await searchPortal(q);
  const none = catalog.length + articles.length === 0;

  return (
    <PortalPage>
      <form action="/portal/search" method="get" role="search" className="flex flex-wrap gap-2">
        <label htmlFor="ps" className="sr-only">{p.searchLabel}</label>
        <input id="ps" name="q" type="search" defaultValue={q} required placeholder={p.searchPlaceholder} className={`${portalField} h-12 min-w-[240px] flex-1`} />
        <button type="submit" className="h-12 rounded-control bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover">{p.searchBtn}</button>
      </form>
      <h1 className="m-0 text-2xl font-bold">{p.searchTitle(q)}</h1>
      {none && (
        <p className="m-0 text-sm text-muted" role="status">
          {p.searchNone} <Link href={`/portal/incident/new?title=${encodeURIComponent(q)}`}>{p.searchReport}</Link>
        </p>
      )}
      {catalog.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xl font-semibold">{p.searchServices}</h2>
          <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
            {catalog.map((c) => (
              <Link key={c.id} href={`/portal/request/new?item=${c.id}`} className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4 text-ink no-underline hover:border-accent hover:text-ink">
                <span className="text-[15px] font-semibold">{c.name}</span>
                <span className="text-[13px] text-muted">{c.items}</span>
                <span className="text-xs font-semibold text-ok-fg">{c.slaText}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {articles.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xl font-semibold">{p.searchArticles}</h2>
          <div className="rounded-card border border-border bg-surface px-4 py-1">
            {articles.map((a) => (
              <Link key={a.id} href={`/portal/knowledge/${a.seq}`} className="flex min-h-[44px] items-center justify-between gap-2.5 border-b border-divider py-3 text-sm text-ink no-underline last:border-b-0 hover:text-accent">
                <span><span className="font-mono text-xs text-muted">{formatDocNo('KB', a.seq)}</span> · {a.title}</span>
                <span className="whitespace-nowrap text-xs text-muted">{p.views(a.views)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </PortalPage>
  );
}
