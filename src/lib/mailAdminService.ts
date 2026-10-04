import { db } from './db';
import { logAudit } from './audit';
import { DomainError } from './errors';
import { mailConfig } from './mail/config';
import { enqueueMail, processOutbox } from './mail/outbox';
import { assertCan, type Role } from './permissions';

export class MailAdminError extends DomainError {}
type Actor = { id: string; role: Role; name: string; email: string };

export async function getEmailOverview() {
  const c = mailConfig();
  const [grouped, recent] = await Promise.all([
    db.emailOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
    db.emailOutbox.findMany({ orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, toEmail: true, template: true, subject: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true, nextAttemptAt: true } }),
  ]);
  const counts = { PENDING: 0, SENT: 0, FAILED: 0 } as Record<string, number>;
  for (const g of grouped) counts[g.status] = g._count._all;
  // แสดงเฉพาะค่าที่ไม่ลับ — ไม่แสดงรหัสผ่าน SMTP
  return { configured: c.configured, host: c.host, port: c.port, secure: c.secure, from: c.from, auth: !!c.user, counts, recent };
}

/** ส่งอีเมลทดสอบถึงผู้ดูแลที่กดเอง (ไม่รับที่อยู่จากฟอร์ม — กันใช้เป็นช่องทางส่งสแปม) */
export async function sendTestMail(actor: Actor) {
  assertCan(actor.role, 'email.manage');
  if (!mailConfig().configured) throw new MailAdminError('ยังไม่ได้ตั้งค่า SMTP_HOST');
  const ok = await enqueueMail(actor.email, { template: 'testMail', name: actor.name, sentBy: actor.name });
  if (!ok) throw new MailAdminError('ใส่คิวอีเมลไม่สำเร็จ');
  await logAudit('USER', actor.id, actor.id, 'ส่งอีเมลทดสอบถึงตนเอง');
  await processOutbox().catch(() => undefined); // ส่งทันทีเพื่อให้เห็นผลเร็ว (ถ้าพลาดก็มี worker ส่งต่อ)
}
