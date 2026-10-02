import { Sidebar } from '@/components/Sidebar';
import { UserSwitcher } from '@/components/UserSwitcher';
import { db } from '@/lib/db';
import { getCurrentUser, switchEnabled } from '@/lib/currentUser';
import type { Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

async function getBadges(): Promise<Record<string, string>> {
  const [open, snap] = await Promise.all([
    db.incident.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    db.dashboardSnapshot.findUnique({ where: { key: 'dashboard' } }),
  ]);
  const fromSnap = ((snap?.data as { navBadges?: Record<string, string> } | null)?.navBadges) ?? {};
  return { ...fromSnap, incident: String(open) };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [badges, user, staff] = await Promise.all([
    getBadges(),
    getCurrentUser(),
    switchEnabled() ? db.user.findMany({ where: { role: { not: 'END_USER' } }, orderBy: { name: 'asc' }, select: { email: true, name: true, role: true } }) : [],
  ]);
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-shell">
      <Sidebar
        badges={badges}
        footer={switchEnabled() && user ? <UserSwitcher users={staff as { email: string; name: string; role: Role }[]} currentEmail={user.email} /> : null}
      />
      <main className="flex min-w-0 flex-col">{children}</main>
    </div>
  );
}
