import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeskLogForm } from '@/components/DeskLogForm';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { can, type Role } from '@/lib/permissions';
import { deskFormOptions } from '@/lib/serviceDeskService';

export const dynamic = 'force-dynamic';

export default async function DeskNewPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user.role as Role, 'incident.manage')) notFound();
  const opts = await deskFormOptions();
  const t = th.desk;
  return (
    <>
      <PageHeader breadcrumb={<><Link href="/service-desk">{t.title}</Link> › {t.log.title}</>} title={t.log.title} initials={user.initials} />
      <div className="box-border w-full max-w-[860px] px-7 pb-10 pt-6">
        <DeskLogForm error={sp.error} {...opts} />
      </div>
    </>
  );
}
