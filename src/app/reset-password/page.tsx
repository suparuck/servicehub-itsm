import Link from 'next/link';
import { checkToken } from '@/lib/passwordReset';
import { th } from '@/i18n/th';
import { ResetForm } from './ResetForm';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'ตั้งรหัสผ่านใหม่ — ServiceHub',
  // token อยู่ใน URL — ห้ามหลุดไปกับ Referer เมื่อผู้ใช้กดลิงก์ออก และห้ามถูก index
  referrer: 'no-referrer' as const,
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const check = await checkToken(token);
  const t = th.reset;

  const problem =
    check.state === 'USED' ? { title: t.usedTitle, body: t.usedBody }
    : check.state === 'EXPIRED' ? { title: t.expiredTitle, body: t.expiredBody }
    : check.state === 'INVALID' ? { title: t.invalidTitle, body: t.invalidBody }
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-card border border-border bg-surface p-8">
        {problem || !token ? (
          <>
            <div role="alert" className="flex flex-col gap-1.5 rounded-control border border-critical-line bg-critical-soft px-3.5 py-3 text-sm text-critical-fg">
              <strong className="text-base">{problem?.title ?? t.invalidTitle}</strong>
              <span>{problem?.body ?? t.invalidBody}</span>
            </div>
            <Link href="/forgot-password" className="flex h-12 items-center justify-center rounded-control bg-accent text-base font-semibold text-white hover:bg-accent-hover">{t.requestNew}</Link>
            <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">{t.backToLogin}</Link>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold tracking-[0.04em] text-muted">ServiceHub</span>
              <h1 className="m-0 text-[26px] font-bold">{check.kind === 'INVITE' ? t.inviteTitle : t.resetTitle}</h1>
              <p className="m-0 text-sm text-muted">{t.resetFor(check.email ?? '')}</p>
            </div>
            <ResetForm token={token} />
          </>
        )}
      </div>
    </main>
  );
}
