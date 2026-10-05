import Link from 'next/link';
import { markAllReadAction, markReadAction } from '@/components/actions/notificationActions';
import { AccountMenu } from '@/components/AccountMenu';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateTime } from '@/lib/datetime';
import { listNotifications } from '@/lib/notificationService';
import type { Role } from '@/lib/permissions';
import { homeFor } from '@/lib/routeAccess';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'การแจ้งเตือน — ServiceHub' };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ unread?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const unreadOnly = sp.unread === '1';
  const t = th.notifications;
  const items = await listNotifications(user.id, { unreadOnly });
  const hasUnread = items.some((n) => !n.read);
  const tab = (active: boolean) => `inline-flex min-h-11 items-center rounded-control border px-4 text-sm no-underline ${active ? 'border-accent bg-accent-tint font-semibold text-accent-hover' : 'border-input bg-surface text-ink hover:text-ink'}`;

  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-8 py-3.5">
        <span className="text-lg font-bold">{th.app.name}</span>
        <span className="grow" />
        <Link href={homeFor(user.role as Role)} className="inline-flex min-h-[44px] items-center text-sm">{t.back}</Link>
        <AccountMenu name={user.name} role={user.role as Role} tone="light" />
      </header>
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-bold">{t.pageTitle}</h1>
          <p className="m-0 text-sm text-muted">{t.pageSub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/notifications" className={tab(!unreadOnly)} aria-current={!unreadOnly ? 'page' : undefined}>{t.all}</Link>
          <Link href="/notifications?unread=1" className={tab(unreadOnly)} aria-current={unreadOnly ? 'page' : undefined}>{t.onlyUnread}</Link>
          <span className="grow" />
          {hasUnread && (
            <form action={markAllReadAction}>
              <button type="submit" className="h-11 rounded-control border border-input bg-surface px-4 text-sm">{t.markAll}</button>
            </form>
          )}
        </div>
        {items.length === 0 ? (
          <p className="m-0 rounded-card border border-border bg-surface p-6 text-sm text-muted">{t.empty}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-border bg-surface p-0">
            {items.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start gap-3 border-b border-divider px-4 py-3 last:border-b-0">
                <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-accent'}`} />
                <div className="flex min-w-0 grow flex-col gap-0.5">
                  <span className={n.read ? 'text-sm' : 'text-sm font-semibold'}>
                    {!n.read && <span className="sr-only">{t.unreadMark} </span>}
                    {n.href ? <a href={`/notifications/open/${n.id}`} className="text-ink hover:text-accent">{n.title}</a> : n.title}
                  </span>
                  {n.body && <span className="text-xs text-muted">{n.body}</span>}
                  <span className="text-xs text-muted">{thDateTime(n.createdAt)}</span>
                </div>
                {!n.read && (
                  <form action={markReadAction.bind(null, n.id)}>
                    <button type="submit" className="min-h-11 px-2 text-xs font-semibold text-accent">ทำเครื่องหมายว่าอ่านแล้ว</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
