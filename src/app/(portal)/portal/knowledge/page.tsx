import Link from 'next/link';
import { PortalPage, portalField } from '@/components/portalBits';
import { th } from '@/i18n/th';
import { formatDocNo } from '@/lib/docno';
import { getKnowledge } from '@/lib/portalService';

export const dynamic = 'force-dynamic';

export default async function PortalKnowledge({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim();
  const p = th.portal;
  const articles = await getKnowledge(q);
  return (
    <PortalPage>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold">{p.knowledge.title}</h1>
        <span className="text-sm text-muted">{p.knowledge.sub}</span>
      </div>
      <form action="/portal/knowledge" method="get" role="search" className="flex flex-wrap gap-2">
        <label htmlFor="kq" className="sr-only">{p.searchLabel}</label>
        <input id="kq" name="q" type="search" defaultValue={q} placeholder={p.searchPlaceholder} className={`${portalField} h-12 min-w-[240px] flex-1`} />
        <button type="submit" className="h-12 rounded-control bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover">{p.searchBtn}</button>
      </form>
      <div className="rounded-card border border-border bg-surface px-4 py-1">
        {articles.length === 0 && <p className="m-0 py-4 text-sm text-muted">{p.knowledge.empty}</p>}
        {articles.map((a) => (
          <Link key={a.id} href={`/portal/knowledge/${a.seq}`} className="flex min-h-[44px] items-center justify-between gap-2.5 border-b border-divider py-3 text-sm text-ink no-underline last:border-b-0 hover:text-accent">
            <span><span className="font-mono text-xs text-muted">{formatDocNo('KB', a.seq)}</span> · {a.title}</span>
            <span className="whitespace-nowrap text-xs text-muted">{p.views(a.views)}</span>
          </Link>
        ))}
      </div>
    </PortalPage>
  );
}
