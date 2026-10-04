import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImpFormFields } from '@/components/ImpFormFields';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { formOptions } from '@/lib/improvementService';
import { can, type Role } from '@/lib/permissions';
import { createImprovementAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewImprovementPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user.role as Role, 'improvement.manage')) notFound();
  const options = await formOptions();
  const t = th.improvement;
  return (
    <>
      <PageHeader breadcrumb={<><Link href="/improvement">{t.title}</Link> › {t.newTitle}</>} title={t.newTitle} initials={user.initials} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <form action={createImprovementAction} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
          <ImpFormFields d={{}} options={options} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{t.form.create}</button>
            <Link href="/improvement" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{th.common.cancel}</Link>
          </div>
        </form>
      </div>
    </>
  );
}
