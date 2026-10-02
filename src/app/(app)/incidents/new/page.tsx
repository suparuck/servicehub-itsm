import { IncidentForm } from '@/components/IncidentForm';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { getFormOptions } from '@/lib/incidentQueries';
import { createIncidentAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewIncidentPage() {
  const [user, opts] = await Promise.all([getCurrentUser(), getFormOptions()]);
  return (
    <>
      <PageHeader breadcrumb={th.incident.listBreadcrumb} title={th.incident.newTitle} initials={user?.initials ?? '··'} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <IncidentForm action={createIncidentAction} mode="new" cancelHref="/incidents" {...opts} />
      </div>
    </>
  );
}
