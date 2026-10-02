import { CiForm } from '@/components/CiForm';
import { PageHeader } from '@/components/PageHeader';
import { notFound } from 'next/navigation';
import { th } from '@/i18n/th';
import { can, type Role } from '@/lib/permissions';
import { getOwnerOptions } from '@/lib/cmdbQueries';
import { getCurrentUser } from '@/lib/currentUser';
import { createCiAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewCiPage() {
  const [user, { groups, users }] = await Promise.all([getCurrentUser(), getOwnerOptions()]);
  if (!can(user.role as Role, 'cmdb.manage')) notFound();
  return (
    <>
      <PageHeader breadcrumb={th.cmdb.breadcrumb} title={th.cmdb.form.newTitle} initials={user?.initials ?? '··'} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <CiForm action={createCiAction} mode="new" cancelHref="/cmdb" groups={groups} users={users} />
      </div>
    </>
  );
}
