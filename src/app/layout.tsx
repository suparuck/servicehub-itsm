import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from 'next/font/google';
import { Sidebar } from '@/components/Sidebar';
import { db } from '@/lib/db';
import { th } from '@/i18n/th';
import './globals.css';

const sans = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = { title: `${th.app.name} — แดชบอร์ด ITSM` };
export const dynamic = 'force-dynamic';

async function getBadges(): Promise<Record<string, string>> {
  const [open, snap] = await Promise.all([
    db.incident.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    db.dashboardSnapshot.findUnique({ where: { key: 'dashboard' } }),
  ]);
  const fromSnap = ((snap?.data as { navBadges?: Record<string, string> } | null)?.navBadges) ?? {};
  return { ...fromSnap, incident: String(open) };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const badges = await getBadges();
  return (
    <html lang="th" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <div className="grid min-h-screen grid-cols-1 md:grid-cols-shell">
          <Sidebar badges={badges} />
          <main className="flex min-w-0 flex-col">{children}</main>
        </div>
      </body>
    </html>
  );
}
