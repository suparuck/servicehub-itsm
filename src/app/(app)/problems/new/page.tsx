import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { can, type Role } from '@/lib/permissions';
import { createProblemAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm';

export default async function NewProblemPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user?.role as Role, 'problem.manage')) notFound();
  const f = th.problem.form;
  return (
    <>
      <PageHeader breadcrumb={th.problem.breadcrumb} title={th.problem.newTitle} initials={user?.initials ?? '··'} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <form action={createProblemAction} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className="text-[13px] font-medium">{f.title} <span aria-hidden="true" className="text-critical">*</span></label>
            <input id="title" name="title" required maxLength={200} className={`${field} min-h-11`} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="text-[13px] font-medium">{f.description}</label>
            <textarea id="description" name="description" rows={5} aria-describedby="d-hint" className={`${field} py-3`} />
            <span id="d-hint" className="text-xs text-muted">{f.descriptionHint}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{f.submit}</button>
            <Link href="/problems" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{th.common.cancel}</Link>
          </div>
        </form>
      </div>
    </>
  );
}
