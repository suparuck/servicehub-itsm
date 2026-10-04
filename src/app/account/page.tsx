import Link from 'next/link';
import { AccountMenu } from '@/components/AccountMenu';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import type { Role } from '@/lib/permissions';
import { homeFor } from '@/lib/routeAccess';
import { PasswordForm } from './PasswordForm';
import { saveNotifyPrefsAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'บัญชีของฉัน — ServiceHub' };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ required?: string; saved?: string }> }) {
  const sp = await searchParams;
  // หน้านี้ต้องเข้าได้แม้ถูกบังคับให้เปลี่ยนรหัสผ่าน
  const user = await getCurrentUser({ allowMustChange: true });
  const t = th.account;
  const forced = user.mustChangePassword || sp.required === '1';

  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-8 py-3.5">
        <span className="text-lg font-bold">{th.app.name}</span>
        <span className="grow" />
        {!forced && <Link href={homeFor(user.role as Role)} className="inline-flex min-h-[44px] items-center text-sm">{t.back}</Link>}
        <AccountMenu name={user.name} role={user.role as Role} tone="light" />
      </header>
      <main className="mx-auto flex w-full max-w-[520px] flex-col gap-5 px-4 py-10">
        <h1 className="m-0 text-2xl font-bold">{t.title}</h1>
        {forced && <div role="status" className="rounded-control border border-warn bg-warn-tint px-3 py-2.5 text-sm text-warn-fg">{t.required}</div>}
        <section className="flex flex-col gap-1 rounded-card border border-border bg-surface p-5" aria-label={t.profile}>
          <span className="text-xs text-muted">{t.profile}</span>
          <span className="text-base font-semibold">{user.name}</span>
          <span className="text-sm text-muted">{user.email}</span>
        </section>
        <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          <p className="m-0 text-sm text-muted">{t.sub}</p>
          {user.passwordHash ? (
            <>
              <PasswordForm />
              <div id="policy" className="flex flex-col gap-1 rounded-control bg-subtle p-3 text-xs text-muted">
                <strong className="text-ink">{t.policyTitle}</strong>
                <ul className="m-0 list-disc pl-5">{t.policy.map((p) => <li key={p}>{p}</li>)}</ul>
                <span className="pt-1">{t.afterChange}</span>
              </div>
            </>
          ) : (
            <p className="m-0 text-sm">{t.ssoOnly}</p>
          )}
        </section>
        {!user.mustChangePassword && (
          <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5" aria-labelledby="notify-h">
            <h2 id="notify-h" className="m-0 text-[17px] font-semibold">{t.notifyTitle}</h2>
            <p className="m-0 text-sm text-muted">{t.notifySub}</p>
            {sp.saved && <div role="status" className="rounded-control border border-ok bg-ok-tint px-3 py-2.5 text-sm text-ok-fg">{t.notifySaved}</div>}
            <form action={saveNotifyPrefsAction} className="flex flex-col gap-1">
              {(Object.keys(t.notifyItems) as (keyof typeof t.notifyItems)[])
                .filter((k) => user.role !== 'END_USER' || k === 'notifyMyItems')
                .map((k) => (
                  <label key={k} className="flex min-h-11 items-start gap-3 py-1.5 text-sm">
                    <input type="hidden" name="shown" value={k} />
                    <input type="checkbox" name={k} defaultChecked={user[k]} className="mt-1 h-4 w-4" />
                    <span className="flex flex-col"><span className="font-medium">{t.notifyItems[k][0]}</span><span className="text-xs text-muted">{t.notifyItems[k][1]}</span></span>
                  </label>
                ))}
              <p className="m-0 pb-2 pt-1 text-xs text-muted">{t.notifySecurity}</p>
              <button type="submit" className="h-11 self-start rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.notifySave}</button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
