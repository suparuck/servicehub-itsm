import { notFound } from 'next/navigation';
import { IncidentForm } from '@/components/IncidentForm';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { formatDocNo } from '@/lib/docno';
import { getFormOptions, getIncidentByDocNo } from '@/lib/incidentQueries';
import { updateIncidentAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function EditIncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, opts, inc] = await Promise.all([getCurrentUser(), getFormOptions(), getIncidentByDocNo(id)]);
  if (!inc || inc.status === 'CLOSED') notFound();
  const no = formatDocNo('INC', inc.seq);
  return (
    <>
      <PageHeader breadcrumb={`${th.incident.listBreadcrumb} › ${no}`} title={`${th.incident.editTitle} ${no}`} initials={user?.initials ?? '··'} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <IncidentForm
          action={updateIncidentAction.bind(null, inc.id)}
          mode="edit"
          cancelHref={`/incidents/${no}`}
          {...opts}
          initial={{
            title: inc.title, description: inc.description ?? '', impact: inc.impact, urgency: inc.urgency,
            serviceId: inc.serviceId ?? '', groupId: inc.groupId ?? '', assigneeId: inc.assigneeId ?? '',
            category: inc.category ?? '', ciIds: inc.cis.map((c) => c.ciId),
          }}
        />
      </div>
    </>
  );
}
