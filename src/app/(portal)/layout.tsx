import Link from 'next/link';
import { PortalNav } from '@/components/PortalNav';
import { th } from '@/i18n/th';
import { getPortalUser } from '@/lib/portalService';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getPortalUser();
  return (
    <div className="min-h-screen bg-subtle text-ink">
      <header className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-8 py-3.5">
        <Link href="/portal" className="inline-flex min-h-[44px] items-center text-lg font-bold text-ink no-underline hover:text-ink">
          {th.portal.brand} <span className="font-normal text-muted">{th.portal.brandSub}</span>
        </Link>
        <span className="grow" />
        <PortalNav />
        <Link href="/" className="inline-flex min-h-[44px] items-center px-2 text-xs text-muted">{th.portal.staffLink}</Link>
        <div aria-label={user?.name} role="img" className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-hover">
          {user?.initials ?? '··'}
        </div>
      </header>
      {children}
    </div>
  );
}
