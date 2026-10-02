import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { flatNav } from '@/lib/nav';

export const dynamic = 'force-dynamic';

// หน้าที่ยังไม่พัฒนา (เฟส 4–7) — กันลิงก์ใน sidebar ไม่ให้ 404
export default async function Placeholder({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = '/' + slug.join('/');
  const item = flatNav.find((n) => path === n.href || path.startsWith(n.href + '/'));
  const isNewIncident = path === '/incidents/new';
  if (!item && !isNewIncident) notFound();
  const user = await getCurrentUser();
  const title = isNewIncident ? th.header.newIncident.replace('+ ', '') : item!.label;

  return (
    <>
      <PageHeader breadcrumb={th.header.breadcrumb} title={title} initials={user?.initials ?? '··'} />
      <div className="flex flex-col items-start gap-3 px-7 py-8">
        <p className="m-0 text-muted">{th.placeholder.body}</p>
        <Link href="/" className="inline-flex min-h-[44px] items-center">
          {th.placeholder.back}
        </Link>
      </div>
    </>
  );
}
