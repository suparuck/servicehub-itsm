import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { formatDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';
import { createArticleAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm';

export default async function NewArticlePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user?.role as Role, 'kb.manage')) notFound();
  const problems = await db.problem.findMany({ orderBy: { seq: 'desc' }, select: { id: true, seq: true, title: true } });
  const f = th.kb.form;
  return (
    <>
      <PageHeader breadcrumb={th.kb.breadcrumb} title={th.kb.newTitle} initials={user?.initials ?? '··'} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <form action={createArticleAction} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.title} <input name="title" required maxLength={200} className={`${field} min-h-11`} /></label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.body}
            <textarea name="body" required rows={10} aria-describedby="b-hint" className={`${field} py-3 leading-relaxed`} />
            <span id="b-hint" className="text-xs font-normal text-muted">{f.bodyHint}</span>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">{f.problem}
            <select name="problemId" className={`${field} min-h-11`} defaultValue="">
              <option value="">{f.none}</option>
              {problems.map((p) => <option key={p.id} value={p.id}>{formatDocNo('PRB', p.seq)} · {p.title}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{f.submitNew}</button>
            <Link href="/knowledge" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{th.common.cancel}</Link>
          </div>
        </form>
      </div>
    </>
  );
}
