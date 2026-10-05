import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { ReleaseFormFields } from '@/components/ReleaseFormFields';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { can, type Role } from '@/lib/permissions';
import { releaseFormOptions } from '@/lib/releaseService';
import { createReleaseAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewReleasePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user.role as Role, 'release.manage')) notFound();
  const options = await releaseFormOptions();
  const t = th.release;
  return (
    <>
      <PageHeader breadcrumb={<><Link href="/releases">{t.title}</Link> › {t.newTitle}</>} title={t.newTitle} initials={user.initials} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <form action={createReleaseAction} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
          <ReleaseFormFields d={{}} options={options} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{t.form.create}</button>
            <Link href="/releases" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{th.common.cancel}</Link>
          </div>
        </form>
      </div>
    </>
  );
}
