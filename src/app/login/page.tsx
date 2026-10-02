import { redirect } from 'next/navigation';
import { auth, entraEnabled } from '@/auth';
import { db } from '@/lib/db';
import type { Role } from '@/lib/permissions';
import { homeFor, safeCallback } from '@/lib/routeAccess';
import { entraLoginAction } from './actions';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'เข้าสู่ระบบ — ServiceHub' };

const NOTICES: Record<string, string> = {
  inactive: 'บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
  AccessDenied: 'ไม่พบบัญชีนี้ในระบบ ServiceHub กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์',
  CredentialsSignin: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; reason?: string; error?: string }> }) {
  const sp = await searchParams;
  const callbackUrl = safeCallback(sp.callbackUrl);

  // ล็อกอินอยู่แล้วและบัญชียังใช้ได้ → ไปหน้าแรกตามบทบาท (ถ้าบัญชีถูกปิด ให้ค้างที่หน้านี้เพื่อเข้าด้วยบัญชีอื่น)
  const session = await auth();
  if (session?.user?.id) {
    const u = await db.user.findUnique({ where: { id: session.user.id }, select: { active: true, role: true } });
    if (u?.active) redirect(callbackUrl !== '/' ? callbackUrl : homeFor(u.role as Role));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-card border border-border bg-surface p-8">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold tracking-[0.04em] text-muted">ITSM · ITIL 4</span>
          <h1 className="m-0 text-[26px] font-bold">ServiceHub</h1>
          <p className="m-0 text-sm text-muted">เข้าสู่ระบบเพื่อใช้งานบริการ IT</p>
        </div>
        <LoginForm callbackUrl={callbackUrl} notice={NOTICES[sp.reason ?? sp.error ?? '']} />
        {entraEnabled && (
          <form action={entraLoginAction} className="flex flex-col gap-2 border-t border-divider pt-5">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <button type="submit" className="h-12 rounded-control border border-input bg-surface text-base font-semibold text-ink hover:border-accent">
              เข้าสู่ระบบด้วย Microsoft (Entra ID)
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
