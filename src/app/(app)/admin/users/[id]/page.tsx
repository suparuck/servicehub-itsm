import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { PageHeader } from '@/components/PageHeader';
import { ResetPasswordPanel } from '@/components/UserForms';
import { Card, StatusBadge } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { thDateTime } from '@/lib/datetime';
import { ROLE_LABEL, can, type Role } from '@/lib/permissions';
import { updateUserAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border min-h-11 w-full rounded-control border border-input bg-surface px-3 text-sm';

export default async function UserDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!can(me.role as Role, 'user.manage')) notFound();
  const [user, groups, activity] = await Promise.all([
    db.user.findUnique({ where: { id }, include: { group: true } }),
    db.assignmentGroup.findMany({ orderBy: { name: 'asc' } }),
    getAudit('USER', id),
  ]);
  if (!user) notFound();
  const t = th.admin;
  const self = user.id === me.id;

  return (
    <>
      <PageHeader breadcrumb={<><Link href="/admin/users">{t.title}</Link> › {user.email}</>} title={user.name} initials={me.initials} />
      <div className="box-border flex w-full max-w-[900px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        {self && <div role="status" className="rounded-control bg-accent-tint px-3 py-2.5 text-sm text-accent-hover">{t.selfNote}</div>}

        <Card className="gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm text-muted">{user.email}</span>
            <StatusBadge tone={user.active ? 'ok' : 'neutral'} className="px-2.5 py-1 text-xs">{user.active ? t.active : t.inactive}</StatusBadge>
            {user.mustChangePassword && <StatusBadge tone="warn" className="px-2.5 py-1 text-xs">{t.mustChange}</StatusBadge>}
            {!user.passwordHash && <StatusBadge tone="accent" className="px-2.5 py-1 text-xs">{t.sso}</StatusBadge>}
            <span className="text-xs text-muted">{t.lastLogin}: {user.lastLoginAt ? thDateTime(user.lastLoginAt) : t.never}</span>
          </div>
          <form action={updateUserAction.bind(null, user.id)} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.form.name} <input name="name" required maxLength={100} defaultValue={user.name} className={field} /></label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.form.role}
                <select name="role" defaultValue={user.role} className={field}>
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.form.group}
                <select name="groupId" defaultValue={user.groupId ?? ''} className={field}>
                  <option value="">{t.form.none}</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-2.5 text-sm"><input type="checkbox" name="active" defaultChecked={user.active} className="h-4 w-4" />{t.form.activeLabel}</label>
            <button type="submit" className="h-11 self-start rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.form.save}</button>
          </form>
        </Card>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.reset}</h2>
          <ResetPasswordPanel userId={user.id} disabledReason={self ? t.resetSelf : undefined} />
        </Card>

        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-semibold">{th.common.activity}</h2>
          <ActivityLog items={activity} empty={th.common.activityNone} />
        </Card>
      </div>
    </>
  );
}
