import { notFound } from 'next/navigation';
import { CiForm } from '@/components/CiForm';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { formatAttributes } from '@/lib/cmdb';
import { getOwnerOptions } from '@/lib/cmdbQueries';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { updateCiAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function EditCiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, opts, ci] = await Promise.all([getCurrentUser(), getOwnerOptions(), db.configurationItem.findUnique({ where: { ciId: id } })]);
  if (!ci) notFound();
  return (
    <>
      <PageHeader breadcrumb={`${th.cmdb.breadcrumb} › ${ci.ciId}`} title={`${th.cmdb.form.editTitle} ${ci.name}`} initials={user?.initials ?? '··'} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <CiForm
          action={updateCiAction.bind(null, ci.ciId)} mode="edit" cancelHref={`/cmdb/${ci.ciId}`} groups={opts.groups} users={opts.users}
          initial={{
            name: ci.name, subtitle: ci.subtitle ?? '', ciClass: ci.ciClass, classLabel: ci.classLabel ?? '', environment: ci.environment,
            lifecycle: ci.lifecycle, ownerGroupId: ci.ownerGroupId ?? '', ownerUserId: ci.ownerUserId ?? '', ownerLabel: ci.ownerLabel ?? '',
            attributes: formatAttributes(ci.attributes),
          }}
        />
      </div>
    </>
  );
}
