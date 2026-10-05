// กติกาของระบบอีเมลที่เป็นฟังก์ชันบริสุทธิ์ (ทดสอบได้โดยไม่ต้องมี DB/SMTP)
import type { NotifyCategory } from './templates';

// ── retry ──
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 3_600_000, 6 * 3_600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1; // ครั้งที่ 1 + retry 5 ครั้ง

/**
 * หน่วงเวลา (ms) ก่อนลองส่งใหม่ หลังล้มเหลวครั้งที่ `attempts` — คืน null เมื่อครบจำนวนครั้งแล้ว (ตั้งเป็น FAILED)
 * 1→1 นาที · 2→5 นาที · 3→15 นาที · 4→1 ชม. · 5→6 ชม. · ครั้งที่ 6 ล้มเหลว = FAILED
 */
export function backoffMs(attempts: number): number | null {
  if (attempts < 1) return BACKOFF_MS[0];
  return attempts > BACKOFF_MS.length ? null : BACKOFF_MS[attempts - 1];
}

// ── ค่าตั้งการแจ้งเตือน ──
export interface NotifyPrefs {
  notifyAssigned: boolean;
  notifyCritical: boolean;
  notifyMyItems: boolean;
  notifyApprovals: boolean;
  notifySla: boolean;
  notifyAssets: boolean;
}

export const PREF_KEY: Record<NotifyCategory, keyof NotifyPrefs> = {
  assigned: 'notifyAssigned',
  critical: 'notifyCritical',
  myItems: 'notifyMyItems',
  approvals: 'notifyApprovals',
  sla: 'notifySla',
  assets: 'notifyAssets',
};

export interface Recipient extends NotifyPrefs {
  id: string;
  email: string;
  name: string;
  active: boolean;
}

/**
 * ผู้รับที่ควรได้อีเมลหมวดนี้: บัญชีที่ใช้งานอยู่ + เปิดหมวดนั้นไว้ + มีอีเมล — ตัดซ้ำ และตัดผู้กระทำเอง (ไม่ต้องแจ้งสิ่งที่ตัวเองเพิ่งทำ)
 */
export function pickRecipients<T extends Recipient>(users: T[], category: NotifyCategory, excludeUserId?: string | null): T[] {
  const seen = new Set<string>();
  return users.filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    if (!u.active || !u.email) return false;
    if (excludeUserId && u.id === excludeUserId) return false;
    return u[PREF_KEY[category]];
  });
}

/** ข้อความย่อสำหรับอีเมล (ตัดความยาว ไม่ให้เนื้อหาผู้ใช้ยาวเกินในกล่องอ้างอิง) */
export function excerpt(text: string | null | undefined, max = 600): string {
  const t = (text ?? '').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
