import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { formatDocNo, parseDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';
import { publishAction, unpublishAction, updateArticleAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm';

export default async function ArticlePage({ params, searchParams }: { params: Promise<{ kb: string }>; searchParams: Promise<{ error?: string }> }) {
  const { kb } = await params;
  const sp = await searchParams;
  const seq = parseDocNo('KB', decodeURIComponent(kb));
  if (seq === null) notFound();
  const article = await db.knowledgeArticle.findUnique({ where: { seq }, include: { problem: true } });
  if (!article) notFound();
  const [user, problems, activity] = await Promise.all([
    getCurrentUser(),
    db.problem.findMany({ orderBy: { seq: 'desc' }, select: { id: true, seq: true, title: true } }),
    getAudit('KB', article.id),
  ]);
  const t = th.kb;
  const role = user?.role as Role | undefined;
  const canEdit = can(role, 'kb.manage');
  const canPublish = can(role, 'kb.publish');
  const no = formatDocNo('KB', article.seq);

  return (
    <>
      <PageHeader breadcrumb={<><Link href="/knowledge">{t.title}</Link> › {no}</>} title={article.title} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1100px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        {!canEdit && <div role="status" className="rounded-control bg-accent-tint px-3 py-2.5 text-sm text-accent-hover">{th.common.noPermission}</div>}
        <Card className="gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm text-muted">{no}</span>
            <StatusBadge tone={article.status === 'PUBLISHED' ? 'ok' : 'warn'} className="px-2.5 py-1 text-xs">{t.status[article.status]}</StatusBadge>
            <span className="text-xs text-muted">{t.viewsLine(article.views)}</span>
            {article.problem && <Link href={`/problems/${formatDocNo('PRB', article.problem.seq)}`} className="inline-flex min-h-[44px] items-center text-xs">{formatDocNo('PRB', article.problem.seq)}</Link>}
            {article.status === 'PUBLISHED' && <Link href={`/portal/knowledge/${article.seq}`} className="inline-flex min-h-[44px] items-center text-xs">{t.viewInPortal}</Link>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {article.status === 'DRAFT' ? (
              <form action={publishAction.bind(null, article.id)}>
                <button type="submit" disabled={!canPublish} className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{t.publish}</button>
              </form>
            ) : (
              <form action={unpublishAction.bind(null, article.id)}>
                <button type="submit" disabled={!canPublish} className="h-11 rounded-control border border-input bg-surface px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50">{t.unpublish}</button>
              </form>
            )}
            <span className="text-xs text-muted">{canPublish ? t.publishHint : t.publishOnlyLead}</span>
          </div>
        </Card>

        <Card className="p-5">
          <form action={updateArticleAction.bind(null, article.id)} className="flex flex-col gap-3">
            <fieldset disabled={!canEdit} className="m-0 flex flex-col gap-3 border-0 p-0">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.form.title} <input name="title" required maxLength={200} defaultValue={article.title} className={`${field} min-h-11`} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.form.body}
                <textarea name="body" required rows={12} defaultValue={article.body ?? ''} className={`${field} py-3 leading-relaxed`} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.form.problem}
                <select name="problemId" defaultValue={article.problemId ?? ''} className={`${field} min-h-11`}>
                  <option value="">{t.form.none}</option>
                  {problems.map((p) => <option key={p.id} value={p.id}>{formatDocNo('PRB', p.seq)} · {p.title}</option>)}
                </select>
              </label>
              {canEdit && <button type="submit" className="h-11 self-start rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.form.submitEdit}</button>}
            </fieldset>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-semibold">{th.common.activity}</h2>
          <ActivityLog items={activity} empty={th.common.activityNone} />
        </Card>
      </div>
    </>
  );
}
