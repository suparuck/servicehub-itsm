import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { th } from '@/i18n/th';
import { listCategories, listSlas } from '@/lib/catalogueService';
import { getCurrentUser } from '@/lib/currentUser';
import { can, type Role } from '@/lib/permissions';
import { createServiceAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';

export default async function NewServicePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!can(user.role as Role, 'catalogue.manage')) notFound();
  const [slas, categories] = await Promise.all([listSlas(), listCategories()]);
  const t = th.catalogue;
  const f = t.form;
  return (
    <>
      <PageHeader breadcrumb={<><Link href="/catalogue">{t.title}</Link> › {t.newTitle}</>} title={t.newTitle} initials={user.initials} />
      <div className="box-border w-full max-w-[760px] px-7 pb-10 pt-6">
        <form action={createServiceAction} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="text-[13px] font-medium">{f.code} <span aria-hidden="true" className="text-critical">*</span></label>
            <input id="code" name="code" required maxLength={20} autoCapitalize="characters" aria-describedby="code-hint" className={`${field} font-mono uppercase`} />
            <span id="code-hint" className="text-xs text-muted">{f.codeHint}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-[13px] font-medium">{f.name} <span aria-hidden="true" className="text-critical">*</span></label>
            <input id="name" name="name" required maxLength={100} className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fullName" className="text-[13px] font-medium">{f.fullName}</label>
            <input id="fullName" name="fullName" maxLength={150} className={field} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="category" className="text-[13px] font-medium">{f.category}</label>
              <input id="category" name="category" list="cats" maxLength={80} className={field} />
              <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ownerName" className="text-[13px] font-medium">{f.owner}</label>
              <input id="ownerName" name="ownerName" maxLength={100} className={field} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="slaId" className="text-[13px] font-medium">{f.sla}</label>
              <select id="slaId" name="slaId" defaultValue="" className={field}>
                <option value="">{f.none}</option>
                {slas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sortOrder" className="text-[13px] font-medium">{f.sortOrder}</label>
              <input id="sortOrder" name="sortOrder" type="number" min={0} max={9999} defaultValue={0} className={field} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{f.create}</button>
            <Link href="/catalogue" className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-5 text-sm text-ink no-underline hover:text-ink">{th.common.cancel}</Link>
          </div>
        </form>
      </div>
    </>
  );
}
