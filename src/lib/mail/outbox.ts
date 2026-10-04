import { Prisma } from '@prisma/client';
import { db } from '../db';
import { absoluteUrl } from './config';
import { MAX_ATTEMPTS, backoffMs } from './rules';
import { render, TEMPLATE_META, type MailMessage } from './templates';
import { sendMail } from './transport';

type Client = typeof db | Prisma.TransactionClient;

const LEASE_MS = 2 * 60_000;
const BATCH = 10;

/**
 * ใส่อีเมลเข้าคิว (outbox) — ไม่ส่งทันที ทำให้การทำงานหลักไม่ช้า/ไม่พังเมื่อ SMTP ล่ม
 * dedupeKey: กันส่งซ้ำ (เช่น SLA เตือนครั้งเดียวต่อ timer)
 * ไม่โยน error ออกไป — อีเมลล้มเหลวต้องไม่ทำให้ action หลักล้ม
 */
export async function enqueueMail(to: string, message: MailMessage, opts: { dedupeKey?: string; client?: Client } = {}): Promise<boolean> {
  try {
    const rendered = render(message, absoluteUrl('/account'));
    const meta = TEMPLATE_META[message.template];
    await (opts.client ?? db).emailOutbox.create({
      data: {
        toEmail: to.trim().toLowerCase(),
        template: message.template,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        critical: meta.critical,
        dedupeKey: opts.dedupeKey,
      },
    });
    return true;
  } catch (err) {
    // dedupeKey ซ้ำ = เคยเข้าคิวแล้ว (ปกติ)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
    console.error('[mail] enqueue failed', err instanceof Error ? err.message : err);
    return false;
  }
}

/** จองงาน: ล็อกระดับแถว (SKIP LOCKED) ให้หลาย instance ไม่ส่งซ้ำกัน */
async function leaseBatch(now: Date): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "EmailOutbox" SET "leasedUntil" = ${new Date(now.getTime() + LEASE_MS)}
    WHERE id IN (
      SELECT id FROM "EmailOutbox"
      WHERE status = 'PENDING' AND "nextAttemptAt" <= ${now} AND ("leasedUntil" IS NULL OR "leasedUntil" < ${now})
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  return rows.map((r) => r.id);
}

export interface ProcessResult {
  sent: number;
  retried: number;
  failed: number;
}

/** ประมวลผลคิวหนึ่งรอบ — คืนจำนวนที่ส่งสำเร็จ/เลื่อนลองใหม่/ล้มเหลวถาวร */
export async function processOutbox(now = new Date()): Promise<ProcessResult> {
  const result: ProcessResult = { sent: 0, retried: 0, failed: 0 };
  const ids = await leaseBatch(now);
  for (const id of ids) {
    const row = await db.emailOutbox.findUnique({ where: { id } });
    if (!row || row.status !== 'PENDING') continue;
    const res = await sendMail({ to: row.toEmail, subject: row.subject, text: row.text ?? '', html: row.html ?? '' });
    if (res.ok) {
      // ล้างเนื้อหาหลังส่ง — ไม่เก็บลิงก์รีเซ็ตรหัสผ่านค้างใน DB
      await db.emailOutbox.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), attempts: row.attempts + 1, text: null, html: null, leasedUntil: null, lastError: null } });
      result.sent++;
      continue;
    }
    const attempts = row.attempts + 1;
    const delay = res.permanent ? null : backoffMs(attempts);
    if (delay === null || attempts >= MAX_ATTEMPTS) {
      await db.emailOutbox.update({ where: { id }, data: { status: 'FAILED', attempts, lastError: res.error, text: null, html: null, leasedUntil: null } });
      result.failed++;
    } else {
      await db.emailOutbox.update({ where: { id }, data: { attempts, lastError: res.error, nextAttemptAt: new Date(Date.now() + delay), leasedUntil: null } });
      result.retried++;
    }
  }
  return result;
}

/** worker ในโปรเซสเว็บ: poll ทุก 5 วินาที (ปิดได้ด้วย MAIL_WORKER=off เมื่อแยก worker ต่างหาก) */
const g = globalThis as unknown as { mailWorker?: ReturnType<typeof setInterval> };
export function startMailWorker(intervalMs = 5000) {
  if (g.mailWorker || process.env.MAIL_WORKER === 'off') return;
  let running = false;
  g.mailWorker = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processOutbox();
    } catch (err) {
      console.error('[mail] worker error', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  }, intervalMs);
  g.mailWorker.unref?.();
}
