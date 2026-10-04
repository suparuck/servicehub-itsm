import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge } from '@/components/ui';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateTime } from '@/lib/datetime';
import { getEmailOverview } from '@/lib/mailAdminService';
import { can, type Role } from '@/lib/permissions';
import { sendTestMailAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS = { PENDING: { label: 'รอส่ง', tone: 'warn' }, SENT: { label: 'ส่งแล้ว', tone: 'ok' }, FAILED: { label: 'ล้มเหลว', tone: 'critical' } } as const;

export default async function EmailAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!can(me.role as Role, 'email.manage')) notFound();
  const o = await getEmailOverview();

  return (
    <>
      <PageHeader breadcrumb={<><Link href="/admin/users">ผู้ดูแลระบบ</Link> › อีเมลและการแจ้งเตือน</>} title="อีเมลและการแจ้งเตือน" initials={me.initials} />
      <div className="box-border flex w-full max-w-[1000px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        {sp.sent && <div role="status" className="rounded-control border border-ok bg-ok-tint px-3 py-2.5 text-sm text-ok-fg">ใส่คิวและพยายามส่งอีเมลทดสอบถึง {me.email} แล้ว — ตรวจกล่องจดหมาย (ดูสถานะในตารางด้านล่าง)</div>}

        <Card className="gap-3 p-5">
          <h2 className="m-0 text-[17px] font-semibold">การเชื่อมต่อ SMTP</h2>
          {o.configured ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted">เซิร์ฟเวอร์</dt><dd className="m-0 font-mono">{o.host}:{o.port}</dd>
              <dt className="text-muted">การเข้ารหัส</dt><dd className="m-0">{o.secure ? 'TLS ตั้งแต่เริ่ม' : 'STARTTLS (ถ้าเซิร์ฟเวอร์รองรับ)'}</dd>
              <dt className="text-muted">ยืนยันตัวตน</dt><dd className="m-0">{o.auth ? 'ใช้ชื่อผู้ใช้/รหัสผ่าน' : 'ไม่ใช้'}</dd>
              <dt className="text-muted">ผู้ส่ง</dt><dd className="m-0">{o.from}</dd>
            </dl>
          ) : (
            <p role="status" className="m-0 rounded-control border border-warn bg-warn-tint px-3 py-2.5 text-sm text-warn-fg">ยังไม่ได้ตั้งค่า SMTP (ตั้ง SMTP_HOST ใน environment) — อีเมลจะค้างในคิวและส่งออกเมื่อตั้งค่าเสร็จ ส่วนฟังก์ชันอื่นของระบบทำงานปกติ</p>
          )}
          <form action={sendTestMailAction}>
            <button type="submit" disabled={!o.configured} className="h-11 rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50">ส่งอีเมลทดสอบถึงฉัน ({me.email})</button>
          </form>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => (
            <Card key={k} className="gap-1 p-4">
              <span className="text-xs text-muted">{STATUS[k].label}</span>
              <span className="font-mono text-2xl font-semibold">{o.counts[k] ?? 0}</span>
            </Card>
          ))}
        </div>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">อีเมลล่าสุด (30 รายการ)</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">คิวอีเมลขาออก</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">เวลา</th>
                  <th scope="col" className="py-2 pr-3 font-medium">ถึง</th>
                  <th scope="col" className="py-2 pr-3 font-medium">หัวข้อ</th>
                  <th scope="col" className="py-2 pr-3 font-medium">สถานะ</th>
                  <th scope="col" className="py-2 font-medium">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {o.recent.length === 0 && <tr><td colSpan={5} className="py-4 text-muted">ยังไม่มีอีเมลในคิว</td></tr>}
                {o.recent.map((m) => (
                  <tr key={m.id} className="border-b border-divider align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted">{thDateTime(m.createdAt)}</td>
                    <td className="py-2 pr-3 break-all">{m.toEmail}</td>
                    <td className="py-2 pr-3">{m.subject}</td>
                    <td className="py-2 pr-3"><StatusBadge tone={STATUS[m.status as keyof typeof STATUS].tone}>{STATUS[m.status as keyof typeof STATUS].label}</StatusBadge></td>
                    <td className="py-2 text-xs text-muted">
                      {m.status === 'PENDING' && m.attempts > 0 ? `ลองแล้ว ${m.attempts} ครั้ง · ลองใหม่ ${thDateTime(m.nextAttemptAt)} · ` : ''}
                      {m.lastError ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
