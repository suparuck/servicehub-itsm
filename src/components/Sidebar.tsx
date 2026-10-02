'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { th } from '@/i18n/th';
import { NAV } from '@/lib/nav';
import { cx } from './ui';

export function Sidebar({ badges }: { badges: Record<string, string> }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));

  return (
    <nav
      aria-label={th.app.mainNav}
      className="hidden flex-col gap-[18px] bg-sidebar px-3.5 py-5 text-[#D9DCE1] md:flex md:sticky md:top-0 md:h-screen md:overflow-y-auto"
    >
      <Link href="/" className="flex items-center gap-2.5 px-2 pb-3 pt-1 no-underline">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-control bg-accent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
            <path d="M12 12l8-4.5" />
            <path d="M12 12v9" />
            <path d="M12 12L4 7.5" />
          </svg>
        </span>
        <span className="flex flex-col">
          <span className="text-base font-bold text-white">{th.app.name}</span>
          <span className="text-[11px] tracking-[0.04em] text-[#9AA1AC]">{th.app.tagline}</span>
        </span>
      </Link>

      {NAV.map((g) => (
        <div key={g.group} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-[#8C93A0]">{g.group}</div>
          {g.items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.id}
                href={it.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-[44px] items-center justify-between rounded-md px-2.5 text-sm no-underline hover:bg-sidebar-active hover:text-white',
                  active ? 'bg-sidebar-active font-semibold text-white' : 'text-[#D9DCE1]',
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span className={cx('h-1.5 w-1.5 rounded-full', active ? 'bg-accent-light' : 'bg-[#4A515B]')} />
                  {it.label}
                </span>
                <span className="font-mono text-[11px] text-[#9AA1AC]">{badges[it.id] ?? ''}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
