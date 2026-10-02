import { RequestForm } from '@/components/PortalForms';
import { PortalPage } from '@/components/portalBits';
import { th } from '@/i18n/th';
import { db } from '@/lib/db';
import { submitRequestAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function PortalNewRequest({ searchParams }: { searchParams: Promise<{ item?: string; access?: string }> }) {
  const sp = await searchParams;
  const f = th.portal.requestForm;
  const items = await db.catalogItem.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } });
  // ทางลัด "ขอสิทธิ์เข้าถึง" → เลือกหมวดบัญชีผู้ใช้ และเติมหัวข้อให้
  const access = sp.access === '1';
  const initialItem = sp.item ?? (access ? items.find((i) => i.name.includes('บัญชีผู้ใช้'))?.id : undefined);
  return (
    <PortalPage className="max-w-[760px]">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold">{f.title}</h1>
        <span className="text-sm text-muted">{f.sub}</span>
      </div>
      <RequestForm action={submitRequestAction} items={items} initialItem={initialItem} initialTitle={access ? f.accessPrefix : undefined} />
    </PortalPage>
  );
}
