import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { CreateUserForm } from '@/components/UserForms';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { can, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  const me = await getCurrentUser();
  if (!can(me.role as Role, 'user.manage')) notFound();
  const groups = await db.assignmentGroup.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader breadcrumb={th.admin.breadcrumb} title={th.admin.newTitle} initials={me.initials} />
      <div className="box-border w-full max-w-[720px] px-7 pb-10 pt-6">
        <CreateUserForm groups={groups} />
      </div>
    </>
  );
}
