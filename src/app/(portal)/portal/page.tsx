import Link from 'next/link';
import { MineCard, PortalPage, SurveyForm } from '@/components/portalBits';
import { th } from '@/i18n/th';
import { db } from '@/lib/db';
import { dayDiffBangkok } from '@/lib/portal';
import { getMine, getOutage, getPortalUser, getSurveyCandidate } from '@/lib/portalService';
import { surveyFromHomeAction } from './actions';

export const dynamic = 'force-dynamic';

const ICONS = [
  'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM20 17v5H6.5A2.5 2.5 0 0 1 4 19.5',
];

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ error?: string; rated?: string }> }) {
  const sp = await searchParams;
  const p = th.portal;
  const user = await getPortalUser();
  const [outage, catalog, catalogCount, kb, mine, survey] = await Promise.all([
    getOutage(),
    db.catalogItem.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.catalogItem.count(),
    db.knowledgeArticle.findMany({ where: { status: 'PUBLISHED' }, orderBy: { views: 'desc' }, take: 4 }),
    user ? getMine(user.id, { onlyActive: true, take: 3 }) : [],
    user ? getSurveyCandidate(user.id) : null,
  ]);
  const firstName = user?.name.split(' ')[0] ?? '';
  const days = survey ? dayDiffBangkok(survey.at) : 0;
  const closed = days <= 0 ? p.closedWhen.today : days === 1 ? p.closedWhen.yesterday : p.closedWhen.daysAgo(days);

  return (
    <>
      <section className="bg-sidebar px-8 pb-14 pt-12 text-white">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-[18px]">
          <span className="text-sm text-[#A9AFB9]">{p.greet(firstName)}</span>
          <h1 className="m-0 text-[32px] font-bold leading-[1.25] md:text-[40px]">{p.headline}</h1>
          <form action="/portal/search" method="get" role="search" className="flex flex-wrap gap-2">
            <label htmlFor="ps" className="sr-only">{p.searchLabel}</label>
            <input id="ps" name="q" type="search" required placeholder={p.searchPlaceholder} className="box-border h-14 min-w-[240px] grow rounded-card border-0 px-[18px] text-base text-ink" />
            <button type="submit" className="h-14 rounded-card border-0 bg-accent px-[26px] text-base font-semibold text-white hover:bg-accent-hover">{p.searchBtn}</button>
          </form>
          {outage && (
            <div className="flex flex-wrap items-center gap-2.5 text-sm text-[#D9DCE1]" role="status">
              <span aria-hidden="true" className="h-0 w-0 border-x-[6px] border-b-[10px] border-x-transparent border-b-[#F59E0B]" />
              <span>{outage.text}{outage.update ? ` · ${outage.update}` : ''}</span>
              <Link href="/portal/status" className="inline-flex min-h-[44px] items-center text-[#C9D5FB]">{p.viewStatus}</Link>
            </div>
          )}
        </div>
      </section>

      <PortalPage className="-mt-7 gap-8">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {p.quick.map((q, i) => (
            <Link key={q.title} href={q.href} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-[18px] text-ink no-underline hover:border-accent hover:text-ink">
              <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-tint">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#163A9E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[i]} /></svg>
              </span>
              <span className="text-base font-semibold">{q.title}</span>
              <span className="text-[13px] leading-normal text-muted">{q.desc}</span>
              <span className="font-mono text-[11px] text-muted">{q.practice}</span>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <h2 className="m-0 text-xl font-semibold">{p.catalogTitle}</h2>
              <Link href="/portal/catalog" className="inline-flex min-h-[44px] items-center text-sm">{p.catalogAll(catalogCount)}</Link>
            </div>
            <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
              {catalog.map((c) => (
                <Link key={c.id} href={`/portal/request/new?item=${c.id}`} className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4 text-ink no-underline hover:border-accent hover:text-ink">
                  <span className="text-[15px] font-semibold">{c.name}</span>
                  <span className="text-[13px] leading-normal text-muted">{c.items}</span>
                  <span className="text-xs font-semibold text-ok-fg">{c.slaText}</span>
                </Link>
              ))}
            </div>

            <h2 className="mb-0 mt-4 text-xl font-semibold">{p.popularKb}</h2>
            <div className="rounded-card border border-border bg-surface px-4 py-1">
              {kb.map((k) => (
                <Link key={k.id} href={`/portal/knowledge/${k.seq}`} className="flex min-h-[44px] items-center justify-between gap-2.5 border-b border-divider py-3 text-sm text-ink no-underline last:border-b-0 hover:text-accent">
                  <span>{k.title}</span>
                  <span className="whitespace-nowrap text-xs text-muted">{p.views(k.views)}</span>
                </Link>
              ))}
            </div>
            <Link href="/portal/knowledge" className="inline-flex min-h-[44px] items-center self-start text-sm">{p.kbAll}</Link>
          </section>

          <aside className="flex flex-col gap-3.5">
            <h2 className="m-0 text-xl font-semibold">{p.mineTitle}</h2>
            {mine.length === 0 && <p className="m-0 rounded-card border border-border bg-surface p-4 text-sm text-muted">{p.mineEmpty}</p>}
            {mine.map((m) => <MineCard key={m.key} item={m} />)}
            <Link href="/portal/my" className="inline-flex min-h-[44px] items-center self-start text-sm">{p.mineAll}</Link>

            <div className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4">
              <span className="text-[15px] font-semibold">{p.rateTitle}</span>
              {sp.rated && <span role="status" className="text-sm text-ok-fg">{p.rateThanks}</span>}
              {survey ? (
                <>
                  <span className="text-[13px] text-muted">{survey.docNo} · {survey.title} · {closed}</span>
                  <SurveyForm action={surveyFromHomeAction.bind(null, survey.docNo)} />
                </>
              ) : (
                !sp.rated && <span className="text-[13px] text-muted">—</span>
              )}
            </div>
          </aside>
        </div>
      </PortalPage>
    </>
  );
}
