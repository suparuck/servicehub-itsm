import { notFound } from 'next/navigation';
import { ChangeForm } from '@/components/ChangeForm';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { getChangeFormOptions } from '@/lib/changeQueries';
import { getCurrentUser } from '@/lib/currentUser';
import { can, type Role } from '@/lib/permissions';
import { createChangeAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewChangePage() {
  const [user, opts] = await Promise.all([getCurrentUser(), getChangeFormOptions()]);
  if (!can(user?.role as Role, 'change.create')) notFound();
  return (
    <>
      <PageHeader breadcrumb={th.change.breadcrumb} title={th.change.newTitle} initials={user?.initials ?? '··'} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <ChangeForm action={createChangeAction} mode="new" cancelHref="/changes" {...opts} />
      </div>
    </>
  );
}
