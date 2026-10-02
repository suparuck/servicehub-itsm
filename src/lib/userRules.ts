import type { Role } from './permissions';

export interface UserLike {
  id: string;
  role: Role;
  active: boolean;
}

/**
 * กฎกันเหตุเผลอเวลาผู้ดูแลแก้ไขผู้ใช้ — คืนข้อความผิดพลาด หรือ null ถ้าทำได้
 * - ปิดบัญชีหรือลดบทบาทของตัวเองไม่ได้ (กันล็อกตัวเองออก)
 * - ต้องเหลือ ADMIN ที่ใช้งานอยู่อย่างน้อย 1 คนเสมอ
 */
export function checkUserChange(
  actorId: string,
  target: UserLike,
  next: { role: Role; active: boolean },
  activeAdminCount: number,
): string | null {
  const isSelf = actorId === target.id;
  if (isSelf && !next.active) return 'ปิดบัญชีของตัวเองไม่ได้';
  if (isSelf && target.role === 'ADMIN' && next.role !== 'ADMIN') return 'ลดบทบาทของตัวเองไม่ได้';
  const wasActiveAdmin = target.role === 'ADMIN' && target.active;
  const stillActiveAdmin = next.role === 'ADMIN' && next.active;
  if (wasActiveAdmin && !stillActiveAdmin && activeAdminCount <= 1) return 'ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน';
  return null;
}

/** อีเมลที่ยอมรับ: ตัวพิมพ์เล็ก ไม่มีช่องว่าง รูปแบบ local@domain.tld */
export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

/** ตัวย่อชื่อสำหรับ avatar: 2 ตัวอักษรแรกของคำแรกและคำที่สอง (ไทย/อังกฤษ) */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = (s: string) => [...s];
  if (parts.length >= 2) return (chars(parts[0])[0] + chars(parts[1])[0]).toUpperCase();
  return chars(parts[0] ?? '··').slice(0, 2).join('').toUpperCase();
}
