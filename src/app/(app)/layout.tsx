import { Sidebar } from '@/components/Sidebar';
import { db } from '@/lib/db';

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
  const badges = await getBadges();
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-shell">
      <Sidebar badges={badges} />
      <main className="flex min-w-0 flex-col">{children}</main>
    </div>
  );
}
