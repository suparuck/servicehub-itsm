'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { th } from '@/i18n/th';
import { markAllReadAction, markReadAction } from './actions/notificationActions';

export interface BellItem {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  when: string;
}

const POLL_MS = 60_000;

export function BellMenu({ unread, items }: { unread: number; items: BellItem[] }) {
  const t = th.notifications;
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // ปิดเมื่อคลิกนอกกล่อง หรือกด Esc (คืนโฟกัสให้ปุ่ม)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // ดึงรายการใหม่ทุก 1 นาทีขณะเปิดหน้าอยู่ (ไม่ poll ตอนแท็บถูกซ่อน)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  const label = unread > 0 ? t.bellUnread(unread) : t.bell;
  const read = (id: string) => startTransition(() => markReadAction(id));

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="bell-panel"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 items-center justify-center rounded-control border border-input bg-surface"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16191D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span data-testid="bell-count" aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-critical px-1 font-mono text-[11px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div id="bell-panel" role="region" aria-label={t.title} className="absolute right-0 z-30 mt-2 flex max-h-[70vh] w-[380px] max-w-[92vw] flex-col rounded-card border border-border bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-divider px-4 py-2.5">
            <strong className="grow text-sm">{t.title}</strong>
            {unread > 0 && (
              <button type="button" onClick={() => startTransition(() => markAllReadAction())} className="min-h-11 px-2 text-xs font-semibold text-accent">
                {t.markAll}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="m-0 px-4 py-6 text-sm text-muted">{t.empty}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col overflow-y-auto p-0">
              {items.map((n) => {
                const inner = (
                  <>
                    <span className="flex items-start gap-2">
                      {!n.read && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                      <span className={n.read ? 'text-sm' : 'text-sm font-semibold'}>
                        {!n.read && <span className="sr-only">{t.unreadMark} </span>}
                        {n.title}
                      </span>
                    </span>
                    {n.body && <span className="line-clamp-2 pl-4 text-xs text-muted">{n.body}</span>}
                    <span className="pl-4 text-xs text-muted">{n.when}</span>
                  </>
                );
                const cls = 'flex min-h-11 flex-col gap-0.5 border-b border-divider px-4 py-2.5 text-left text-ink no-underline hover:bg-subtle hover:text-ink';
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <a href={`/notifications/open/${n.id}`} className={cls}>{inner}</a>
                    ) : (
                      <button type="button" className={`${cls} w-full bg-transparent`} onClick={() => { if (!n.read) read(n.id); }}>{inner}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/notifications" onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-center border-t border-divider text-sm font-semibold text-accent no-underline">
            {t.viewAll}
          </Link>
        </div>
      )}
    </div>
  );
}
