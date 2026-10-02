import Link from 'next/link';
import { IncidentReportForm } from '@/components/PortalForms';
import { PortalPage } from '@/components/portalBits';
import { th } from '@/i18n/th';
import { db } from '@/lib/db';
import { reportIncidentAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function PortalReportIncident({ searchParams }: { searchParams: Promise<{ title?: string }> }) {
  const sp = await searchParams;
  const f = th.portal.incidentForm;
  const [services, kb] = await Promise.all([
    db.service.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    db.knowledgeArticle.findMany({ where: { status: 'PUBLISHED' }, orderBy: { views: 'desc' }, take: 3 }),
  ]);
  return (
    <PortalPage className="max-w-[760px]">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold">{f.title}</h1>
        <span className="text-sm text-muted">{f.sub}</span>
      </div>
      <section aria-label={f.kbHint} className="flex flex-col gap-1 rounded-card bg-accent-tint p-4">
        <span className="text-sm font-semibold text-accent-hover">{f.kbHint}</span>
        {kb.map((a) => <Link key={a.id} href={`/portal/knowledge/${a.seq}`} className="inline-flex min-h-[44px] items-center text-sm">{a.title}</Link>)}
      </section>
      <IncidentReportForm action={reportIncidentAction} services={services} initialTitle={sp.title} />
    </PortalPage>
  );
}
