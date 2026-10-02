import { redirect } from 'next/navigation';
import { AccountMenu } from '@/components/AccountMenu';
import { Sidebar } from '@/components/Sidebar';
import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
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
  const user = await getCurrentUser();
  // ผู้ใช้ปลายทางใช้ได้เฉพาะพอร์ทัล (middleware กั้นแล้ว — ตรวจซ้ำที่นี่เป็นชั้นที่สอง)
  if (user.role === 'END_USER') redirect('/portal');
  const badges = await getBadges();
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-shell">
      <Sidebar badges={badges} footer={<AccountMenu name={user.name} role={user.role as Role} />} />
      <main className="flex min-w-0 flex-col">{children}</main>
    </div>
  );
}
