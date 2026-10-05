import { db } from './db';
import { DomainError } from './errors';

export class NotificationError extends DomainError {}

/** พาธภายในเท่านั้น (กัน open redirect): ขึ้นต้นด้วย / ไม่ใช่ // หรือ /\ และไม่มีอักขระควบคุม */
export function safeInternalPath(p: string): boolean {
  return p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/' + String.fromCharCode(92)) && !/[\u0000-\u001f]/.test(p);
}

const LIST_LIMIT = 15;
const KEEP_DAYS = 90;

export interface NotificationItem {
  id: string;
  category: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: Date;
}

/** รายการล่าสุดของผู้ใช้ + จำนวนที่ยังไม่อ่าน (ใช้กับกระดิ่งในส่วนหัว) */
export async function getBell(userId: string): Promise<{ unread: number; items: NotificationItem[] }> {
  const [unread, rows] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: LIST_LIMIT }),
  ]);
  return { unread, items: rows.map(toItem) };
}

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; take?: number } = {}) {
  const rows = await db.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.take ?? 100, 200),
  });
  return rows.map(toItem);
}

const toItem = (r: { id: string; category: string; title: string; body: string | null; href: string | null; readAt: Date | null; createdAt: Date }): NotificationItem => ({
  id: r.id, category: r.category, title: r.title, body: r.body, href: r.href, read: !!r.readAt, createdAt: r.createdAt,
});

/** ทำเครื่องหมายอ่านแล้ว — เฉพาะของตนเอง (userId อยู่ใน where เสมอ จึงอ่านแทนคนอื่นไม่ได้แม้รู้ id) */
export async function markRead(userId: string, id: string) {
  await db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

/** ลบรายการเก่ากว่า 90 วัน (เรียกเป็นครั้งคราวจาก worker) */
export async function purgeOldNotifications(now = new Date()) {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000);
  const r = await db.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return r.count;
}
