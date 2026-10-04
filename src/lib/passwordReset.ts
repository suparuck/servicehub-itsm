import bcrypt from 'bcryptjs';
import type { TokenKind } from '@prisma/client';
import { db } from './db';
import { logAudit } from './audit';
import { thDateShort, thTime } from './datetime';
import { DomainError } from './errors';
import { absoluteUrl } from './mail/config';
import { enqueueMail } from './mail/outbox';
import { ADMIN_RESET_TTL_MS, INVITE_TTL_MS, RESET_TTL_MS, TokenState, generateToken, hashToken, looksLikeToken, tokenState } from './mail/tokens';
import { validatePassword } from './password';
import { isLocked, recordFailure } from './rateLimit';
import { normalizeEmail } from './userRules';

export class ResetError extends DomainError {}

const COST = 12;
// ขอลิงก์ได้ไม่เกิน 3 ครั้ง/15 นาที ต่ออีเมล และ 20 ครั้งต่อไอพี — กันถูกใช้ยิงอีเมลถล่มเจ้าของบัญชี
const MAX_REQUESTS_PER_EMAIL = 3;
const MAX_REQUESTS_PER_IP = 20;

const when = (d: Date) => `${thDateShort(d)} ${thTime(d)} น.`;

/**
 * ออก token ใหม่ให้ผู้ใช้ (ยกเลิก token ที่ยังไม่ใช้ชนิดเดียวกันก่อน — มีลิงก์ที่ใช้ได้ทีละอันเดียว)
 * คืน token จริง (มีเฉพาะตรงนี้ ไม่ถูกเก็บลง DB)
 */
export async function issueToken(userId: string, kind: TokenKind, ttlMs: number, requestIp?: string): Promise<string> {
  const { token, hash } = generateToken();
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId, kind, usedAt: null } }),
    db.passwordResetToken.create({ data: { userId, kind, tokenHash: hash, expiresAt: new Date(Date.now() + ttlMs), requestIp: requestIp?.slice(0, 64) } }),
  ]);
  return token;
}

export const resetLink = (token: string) => absoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`);

/**
 * ผู้ใช้กรอกอีเมลขอลิงก์ลืมรหัสผ่าน — ตอบเหมือนกันเสมอ (ไม่เปิดเผยว่าอีเมลมีในระบบหรือไม่)
 * ส่งเฉพาะบัญชีที่ active และมีรหัสผ่านในระบบ (บัญชี SSO ล้วนไม่มีรหัสให้รีเซ็ต)
 */
export async function requestPasswordReset(emailRaw: string, ip: string): Promise<void> {
  const email = normalizeEmail(emailRaw);
  if (!email) return;
  const keys = [`reset:email:${email}`, `reset:ip:${ip}`];
  if (isLocked(keys[0], Date.now(), MAX_REQUESTS_PER_EMAIL) || isLocked(keys[1], Date.now(), MAX_REQUESTS_PER_IP)) return;
  keys.forEach((k) => recordFailure(k)); // นับทุกคำขอ (ไม่ว่าอีเมลมีจริงหรือไม่ เพื่อไม่ให้พฤติกรรมต่างกัน)

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !user.passwordHash) return;
  const token = await issueToken(user.id, 'RESET', RESET_TTL_MS, ip);
  await enqueueMail(user.email, { template: 'passwordReset', name: user.name, url: resetLink(token), minutes: RESET_TTL_MS / 60_000 });
}

export type TokenCheck = { state: TokenState | 'INVALID'; email?: string; kind?: TokenKind };

/** ตรวจ token ก่อนแสดงฟอร์มตั้งรหัสผ่าน (ไม่เปลี่ยนสถานะใด ๆ) */
export async function checkToken(token: unknown): Promise<TokenCheck> {
  if (!looksLikeToken(token)) return { state: 'INVALID' };
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || !row.user.active) return { state: 'INVALID' };
  const state = tokenState(row);
  return { state, kind: row.kind, email: state === 'OK' ? row.user.email : undefined };
}

/** ตั้งรหัสผ่านใหม่ด้วย token — ใช้ได้ครั้งเดียว, ทำให้ session เดิมทุกอุปกรณ์หมดอายุ */
export async function redeemToken(token: unknown, input: { next: string; confirm: string }): Promise<void> {
  if (!looksLikeToken(token)) throw new ResetError('ลิงก์ไม่ถูกต้อง');
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || !row.user.active) throw new ResetError('ลิงก์ไม่ถูกต้อง');
  const state = tokenState(row);
  if (state === 'USED') throw new ResetError('ลิงก์นี้ถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่');
  if (state === 'EXPIRED') throw new ResetError('ลิงก์หมดอายุแล้ว กรุณาขอลิงก์ใหม่');
  if (input.next !== input.confirm) throw new ResetError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
  const errs = validatePassword(input.next, { email: row.user.email });
  if (errs.length) throw new ResetError(errs.join(' · '));
  const hash = await bcrypt.hash(input.next, COST);
  const now = new Date();

  // ปิด token แบบ atomic (เงื่อนไข usedAt = null) — สองคำขอพร้อมกันใช้ลิงก์เดียวกันได้แค่หนึ่ง
  const claimed = await db.$transaction(async (tx) => {
    const c = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (c.count !== 1) return false;
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash: hash, mustChangePassword: false, passwordChangedAt: now } });
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId, usedAt: null } }); // ลิงก์อื่นที่ค้างอยู่ใช้ไม่ได้แล้ว
    await logAudit('USER', row.userId, null, row.kind === 'INVITE' ? 'ตั้งรหัสผ่านครั้งแรกผ่านลิงก์เชิญทางอีเมล' : 'ตั้งรหัสผ่านใหม่ผ่านลิงก์ทางอีเมล (session เดิมหมดอายุ)', tx);
    return true;
  });
  if (!claimed) throw new ResetError('ลิงก์นี้ถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่');
  await enqueueMail(row.user.email, { template: 'passwordChanged', name: row.user.name, when: when(now), forgotUrl: absoluteUrl('/forgot-password') });
}

export { ADMIN_RESET_TTL_MS, INVITE_TTL_MS };
