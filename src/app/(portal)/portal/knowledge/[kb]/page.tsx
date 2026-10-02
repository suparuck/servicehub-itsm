import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PortalPage } from '@/components/portalBits';
import { th } from '@/i18n/th';
import { db } from '@/lib/db';
import { formatDocNo } from '@/lib/docno';

export const dynamic = 'force-dynamic';

export default async function PortalArticle({ params }: { params: Promise<{ kb: string }> }) {
  const { kb } = await params;
  const seq = Number(kb);
  if (!Number.isInteger(seq)) notFound();
  const article = await db.knowledgeArticle.findFirst({ where: { seq, status: 'PUBLISHED' } });
  if (!article) notFound();
  // นับยอดเข้าชม (ใช้จัดอันดับ "บทความยอดนิยม")
  await db.knowledgeArticle.update({ where: { id: article.id }, data: { views: { increment: 1 } } });
  const p = th.portal;

  return (
    <PortalPage className="max-w-[760px]">
      <Link href="/portal/knowledge" className="inline-flex min-h-[44px] items-center self-start text-sm">{p.knowledge.back}</Link>
      <article className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6">
        <span className="font-mono text-xs text-muted">{formatDocNo('KB', article.seq)} · {p.views(article.views + 1)}</span>
        <h1 className="m-0 text-2xl font-bold leading-snug">{article.title}</h1>
        <div className="whitespace-pre-line text-[15px] leading-[1.8]">{article.body ?? ''}</div>
      </article>
      <div className="flex flex-wrap items-center gap-3 rounded-card bg-accent-tint p-4 text-sm text-accent-hover">
        <span>{p.knowledge.helpful}</span>
        <Link href={`/portal/incident/new?title=${encodeURIComponent(article.title)}`} className="inline-flex min-h-[44px] items-center">{p.knowledge.report}</Link>
      </div>
    </PortalPage>
  );
}
