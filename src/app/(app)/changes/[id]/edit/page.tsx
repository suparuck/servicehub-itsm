import { notFound } from 'next/navigation';
import { ChangeForm } from '@/components/ChangeForm';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { getChangeFormOptions } from '@/lib/changeQueries';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { toBangkokInput } from '@/lib/datetime';
import { formatDocNo, parseDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';
import { updateChangeAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function EditChangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seq = parseDocNo('CHG', decodeURIComponent(id));
  if (seq === null) notFound();
  const [user, opts, c] = await Promise.all([getCurrentUser(), getChangeFormOptions(), db.change.findUnique({ where: { seq }, include: { cis: true } })]);
  if (!c || c.status !== 'DRAFT' || !can(user?.role as Role, 'change.create')) notFound();
  const no = formatDocNo('CHG', c.seq);
  return (
    <>
      <PageHeader breadcrumb={`${th.change.breadcrumb} › ${no}`} title={`${th.change.editTitle} ${no}`} initials={user?.initials ?? '··'} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <ChangeForm
          action={updateChangeAction.bind(null, c.id)} mode="edit" cancelHref={`/changes/${no}`} {...opts}
          initial={{
            title: c.title, type: c.type, risk: c.risk, windowStart: toBangkokInput(c.windowStart), windowEnd: c.windowEnd ? toBangkokInput(c.windowEnd) : '',
            serviceId: c.serviceId ?? '', problemId: c.problemId ?? '', description: c.description ?? '', implementationPlan: c.implementationPlan ?? '',
            backoutPlan: c.backoutPlan ?? '', ciIds: c.cis.map((x) => x.ciId),
          }}
        />
      </div>
    </>
  );
}
