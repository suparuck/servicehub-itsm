import { randomInt } from 'node:crypto';

// นโยบายรหัสผ่าน (ฟังก์ชันบริสุทธิ์ — ทดสอบได้ ไม่แตะ DB)
export const MIN_LENGTH = 10;
export const MAX_LENGTH = 128;

// รหัสที่เดาง่ายมาก (เทียบแบบไม่สนตัวพิมพ์) — ไม่ใช่รายการครบถ้วน แต่กันกรณีที่พบบ่อยที่สุด
const COMMON = ['password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'admin', 'servicehub', '12345678', '123456789', '1234567890', 'iloveyou'];

export interface PasswordContext {
  email?: string;
  currentPassword?: string;
}

const classes = (pw: string) =>
  [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;

/** คืนรายการข้อผิดพลาด (ว่าง = ผ่านนโยบาย) */
export function validatePassword(pw: string, ctx: PasswordContext = {}): string[] {
  const errs: string[] = [];
  if (pw.length < MIN_LENGTH) errs.push(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_LENGTH} ตัวอักษร`);
  if (pw.length > MAX_LENGTH) errs.push(`รหัสผ่านต้องไม่เกิน ${MAX_LENGTH} ตัวอักษร`);
  if (classes(pw) < 3) errs.push('ต้องมีอย่างน้อย 3 ชนิดจาก: ตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ ตัวเลข สัญลักษณ์');
  const lower = pw.toLowerCase();
  if (COMMON.some((c) => lower.includes(c))) errs.push('รหัสผ่านนี้เดาง่ายเกินไป');
  const local = ctx.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) errs.push('รหัสผ่านต้องไม่มีส่วนของอีเมล');
  if (ctx.currentPassword !== undefined && pw === ctx.currentPassword) errs.push('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');
  return errs;
}

// ตัดตัวที่อ่านสับสน (0/O, 1/l/I) เพราะผู้ดูแลต้องส่งรหัสชั่วคราวให้ผู้ใช้อ่านหรือพิมพ์เอง
const SETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];

/** รหัสผ่านชั่วคราว 16 ตัว มีครบทุกชนิด (ใช้ crypto.randomInt — rng ฉีดเข้ามาได้เพื่อทดสอบ) */
export function generateTempPassword(length = 16, rng: (max: number) => number = (n) => randomInt(n)): string {
  const all = SETS.join('');
  const chars = SETS.map((s) => s[rng(s.length)]);
  while (chars.length < length) chars.push(all[rng(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
