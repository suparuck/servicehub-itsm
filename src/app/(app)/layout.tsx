import { redirect } from 'next/navigation';
import { AccountMenu } from '@/components/AccountMenu';
import { Sidebar } from '@/components/Sidebar';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import type { Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

async function getBadges(): Promise<Record<string, string>> {
  const [open, snap, improving, waiting] = await Promise.all([
    db.incident.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    db.dashboardSnapshot.findUnique({ where: { key: 'dashboard' } }),
    db.improvementItem.count({ where: { status: 'OPEN' } }),
    db.incident.count({ where: { status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_USER', 'PENDING_VENDOR'] }, assigneeId: null } }),
  ]);
  const fromSnap = ((snap?.data as { navBadges?: Record<string, string> } | null)?.navBadges) ?? {};
  return { ...fromSnap, incident: String(open), improvement: String(improving), serviceDesk: String(waiting) };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // ผู้ใช้ปลายทางใช้ได้เฉพาะพอร์ทัล (middleware กั้นแล้ว — ตรวจซ้ำที่นี่เป็นชั้นที่สอง)
  if (user.role === 'END_USER') redirect('/portal');
  const badges = await getBadges();
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-shell">
      <Sidebar badges={badges} isAdmin={user.role === 'ADMIN'} footer={<AccountMenu name={user.name} role={user.role as Role} />} />
      <main className="flex min-w-0 flex-col">{children}</main>
    </div>
  );
}
