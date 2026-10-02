import Link from 'next/link';
import { th } from '@/i18n/th';

export function PageHeader({
  breadcrumb,
  title,
  initials,
}: {
  breadcrumb: string;
  title: string;
  initials: string;
}) {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-7 py-3.5">
      <div className="flex grow flex-col">
        <span className="text-xs text-muted">{breadcrumb}</span>
        <h1 className="m-0 text-[22px] font-bold">{title}</h1>
      </div>
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
      <button
        type="button"
        aria-label={th.header.notifications}
        className="flex h-11 w-11 items-center justify-center rounded-control border border-input bg-surface"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16191D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </button>
      <div
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-hover"
      >
        {initials}
      </div>
    </header>
  );
}
