import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Prisma, Role as DbRole } from '@prisma/client';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, StatusBadge, type Column } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { thDateTime } from '@/lib/datetime';
import { ROLE_LABEL, can, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!can(me.role as Role, 'user.manage')) notFound();
  const t = th.admin;

  const where: Prisma.UserWhereInput = {};
  if (sp.role && sp.role in ROLE_LABEL) where.role = sp.role as DbRole;
  if (sp.status === 'active') where.active = true;
  if (sp.status === 'inactive') where.active = false;
  const q = sp.q?.trim();
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }];

  const rows = await db.user.findMany({ where, orderBy: [{ active: 'desc' }, { role: 'asc' }, { name: 'asc' }], include: { group: true } });
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: 'name', header: t.colName,
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <Link href={`/admin/users/${r.id}`} className="inline-flex min-h-[44px] items-center font-medium">{r.name}</Link>
          <span className="-mt-2.5 pb-1 text-xs text-muted">
            {r.mustChangePassword && t.mustChange}
            {!r.passwordHash && t.sso}
          </span>
        </span>
      ),
    },
    { key: 'email', header: t.colEmail, hideOnSmall: true, render: (r) => <span className="break-all font-mono text-xs">{r.email}</span> },
    { key: 'role', header: t.colRole, hideOnSmall: true, render: (r) => <span className="text-[13px]">{ROLE_LABEL[r.role as Role]}</span> },
    { key: 'group', header: t.colGroup, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.group?.name ?? '—'}</span> },
    { key: 'st', header: t.colStatus, render: (r) => <StatusBadge tone={r.active ? 'ok' : 'neutral'} className="text-xs">{r.active ? t.active : t.inactive}</StatusBadge> },
    { key: 'login', header: t.colLastLogin, hideOnSmall: true, render: (r) => <span className="text-xs text-muted">{r.lastLoginAt ? thDateTime(r.lastLoginAt) : t.never}</span> },
  ];

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={me.initials} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <form method="get" action="/admin/users" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{t.search}
            <input type="search" name="q" defaultValue={sp.q} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterRole}
            <select name="role" defaultValue={sp.role ?? ''} className={control}>
              <option value="">{t.allRoles}</option>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterStatus}
            <select name="status" defaultValue={sp.status ?? ''} className={control}>
              <option value="">{t.allStatuses}</option>
              <option value="active">{t.active}</option>
              <option value="inactive">{t.inactive}</option>
            </select>
          </label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{th.common.search}</button>
          <Link href="/admin/users" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
        </form>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted" aria-live="polite">{th.common.total(rows.length)}</span>
            <Link href="/admin/users/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{t.newBtn}</Link>
          </div>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty={th.dashboard.queueEmpty} gridClass="grid-cols-[minmax(0,1fr)_100px] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_170px_150px_100px_170px]" />
        </Card>
      </div>
    </>
  );
}
