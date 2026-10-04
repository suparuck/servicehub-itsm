import { createHash, randomBytes } from 'node:crypto';

// Token ลืมรหัสผ่าน/เชิญผู้ใช้: สุ่ม 256 บิต เก็บใน DB เฉพาะค่าแฮช SHA-256
// (ผู้ที่อ่าน DB ได้ก็ใช้ลิงก์ไม่ได้ — token จริงมีแค่ในอีเมลที่ส่งออกไป)
export const RESET_TTL_MS = 30 * 60_000; // ลืมรหัสผ่านด้วยตนเอง: 30 นาที
export const ADMIN_RESET_TTL_MS = 24 * 3_600_000; // ผู้ดูแลส่งลิงก์ให้: 24 ชั่วโมง
export const INVITE_TTL_MS = 72 * 3_600_000; // เชิญผู้ใช้ใหม่: 72 ชั่วโมง

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url'); // 43 ตัวอักษร
  return { token, hash: hashToken(token) };
}

/** รูปแบบเบื้องต้น (กันค่าขยะก่อนไปถาม DB) */
export const looksLikeToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);

export type TokenState = 'OK' | 'USED' | 'EXPIRED';

export function tokenState(row: { expiresAt: Date; usedAt: Date | null }, now = new Date()): TokenState {
  if (row.usedAt) return 'USED';
  if (row.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'OK';
}
