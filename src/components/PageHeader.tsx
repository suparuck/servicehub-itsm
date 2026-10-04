import type { ReactNode } from 'react';
import Link from 'next/link';
import { th } from '@/i18n/th';
import { NotificationBell } from './NotificationBell';

export function PageHeader({
  breadcrumb,
  title,
  initials,
  custom,
}: {
  breadcrumb: ReactNode;
  title: string;
  initials: string;
  /** แทนที่ช่องค้นหา/ปุ่มเริ่มต้นด้วยตัวควบคุมเฉพาะหน้า (เช่น CMDB) */
  custom?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-7 py-3.5">
      <div className="flex grow flex-col">
        <span className="text-xs text-muted">{breadcrumb}</span>
        <h1 className="m-0 text-[22px] font-bold">{title}</h1>
      </div>
      {custom ? (
        <>
          {custom}
          <NotificationBell />
          <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-hover">
            {initials}
          </div>
        </>
      ) : (
        <DefaultControls initials={initials} />
      )}
    </header>
  );
}

function DefaultControls({ initials }: { initials: string }) {
  return (
    <>
      <label htmlFor="q" className="sr-only">
        {th.header.searchLabel}
      </label>
      <input
        id="q"
        type="search"
        placeholder={th.header.searchPlaceholder}
        className="box-border h-11 w-[340px] max-w-full rounded-control border border-input bg-subtle px-3.5 text-sm"
      />
      <Link
        href="/incidents/new"
        className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white"
      >
        {th.header.newIncident}
      </Link>
      <NotificationBell />
      <div
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-hover"
      >
        {initials}
      </div>
    </>
  );
}
