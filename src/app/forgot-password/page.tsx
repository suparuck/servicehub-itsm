import { th } from '@/i18n/th';
import { ForgotForm } from './ForgotForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ลืมรหัสผ่าน — ServiceHub' };

export default function ForgotPasswordPage() {
  const t = th.reset;
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-card border border-border bg-surface p-8">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold tracking-[0.04em] text-muted">ServiceHub</span>
          <h1 className="m-0 text-[26px] font-bold">{t.forgotTitle}</h1>
          <p className="m-0 text-sm text-muted">{t.forgotSub}</p>
        </div>
        <ForgotForm />
      </div>
    </main>
  );
}
