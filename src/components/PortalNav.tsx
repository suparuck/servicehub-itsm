'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { th } from '@/i18n/th';
import { cx } from './ui';

const ITEMS = [
  { href: '/portal', label: th.portal.nav.home },
  { href: '/portal/catalog', label: th.portal.nav.catalog },
  { href: '/portal/knowledge', label: th.portal.nav.knowledge },
  { href: '/portal/my', label: th.portal.nav.mine },
];

export function PortalNav() {
  const pathname = usePathname();
  const active = (href: string) => (href === '/portal' ? pathname === href : pathname === href || pathname.startsWith(href + '/'));
  return (
    <nav aria-label={th.portal.navAria} className="flex flex-wrap gap-1">
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={active(i.href) ? 'page' : undefined}
          className={cx('flex min-h-[44px] items-center px-3 text-sm text-ink no-underline hover:text-accent', active(i.href) && 'font-semibold underline decoration-accent decoration-2 underline-offset-8')}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
