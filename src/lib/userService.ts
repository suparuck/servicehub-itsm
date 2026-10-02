import bcrypt from 'bcryptjs';
import type { Role as DbRole } from '@prisma/client';
import { db } from './db';
import { logAudit } from './audit';
import { DomainError } from './errors';
import { assertCan, type Role } from './permissions';
import { generateTempPassword, validatePassword } from './password';
import { checkUserChange, initialsOf, normalizeEmail } from './userRules';
import { ROLE_LABEL } from './permissions';

export class UserError extends DomainError {}
/** รหัสผ่านปัจจุบันผิด — ใช้นับเพื่อจำกัดการเดารหัสในหน้าเปลี่ยนรหัสผ่าน */
export class WrongPasswordError extends UserError {}
type Actor = { id: string; role: Role };

const COST = 12;
const ROLES = Object.keys(ROLE_LABEL) as Role[];

const activeAdmins = () => db.user.count({ where: { role: 'ADMIN', active: true } });

export interface UserInput {
  email: string;
  name: string;
  role: string;
  groupId?: string | null;
  /** true = ล็อกอินผ่าน Entra ID เท่านั้น (ไม่ตั้งรหัสผ่าน) */
  ssoOnly?: boolean;
}

function parseRole(r: string): Role {
  if (!ROLES.includes(r as Role)) throw new UserError('บทบาทไม่ถูกต้อง');
  return r as Role;
}

/** สร้างผู้ใช้ — คืนรหัสผ่านชั่วคราว (แสดงครั้งเดียว ไม่เก็บในรูปที่อ่านได้) */
export async function createUser(actor: Actor, input: UserInput): Promise<{ id: string; tempPassword: string | null }> {
  assertCan(actor.role, 'user.manage');
  const email = normalizeEmail(input.email);
  if (!email) throw new UserError('รูปแบบอีเมลไม่ถูกต้อง');
  const name = input.name.trim();
  if (!name) throw new UserError('กรุณาระบุชื่อ');
  if (name.length > 100) throw new UserError('ชื่อยาวเกิน 100 ตัวอักษร');
  const role = parseRole(input.role);
  if (await db.user.findUnique({ where: { email } })) throw new UserError('อีเมลนี้มีอยู่ในระบบแล้ว');

  const tempPassword = input.ssoOnly ? null : generateTempPassword();
  const user = await db.user.create({
    data: {
      email, name, initials: initialsOf(name), role: role as DbRole, groupId: input.groupId || null,
      passwordHash: tempPassword ? await bcrypt.hash(tempPassword, COST) : null,
      mustChangePassword: !!tempPassword,
    },
  });
  await logAudit('USER', user.id, actor.id, `สร้างผู้ใช้ ${email} (${ROLE_LABEL[role]})${input.ssoOnly ? ' · ล็อกอินผ่าน Microsoft เท่านั้น' : ''}`);
  return { id: user.id, tempPassword };
}

export async function updateUser(actor: Actor, id: string, input: { name: string; role: string; groupId?: string | null; active: boolean }) {
  assertCan(actor.role, 'user.manage');
  const target = await db.user.findUnique({ where: { id } });
  if (!target) throw new UserError('ไม่พบผู้ใช้');
  const name = input.name.trim();
  if (!name) throw new UserError('กรุณาระบุชื่อ');
  const role = parseRole(input.role);
  const err = checkUserChange(actor.id, { id: target.id, role: target.role as Role, active: target.active }, { role, active: input.active }, await activeAdmins());
  if (err) throw new UserError(err);

  const notes: string[] = [];
  if (role !== target.role) notes.push(`บทบาท: ${ROLE_LABEL[target.role as Role]} → ${ROLE_LABEL[role]}`);
  if (input.active !== target.active) notes.push(input.active ? 'เปิดใช้งานบัญชี' : 'ปิดการใช้งานบัญชี');
  if (name !== target.name) notes.push(`ชื่อ: ${target.name} → ${name}`);
  if ((input.groupId || null) !== target.groupId) notes.push('เปลี่ยนกลุ่มผู้รับผิดชอบ');
  await db.user.update({
    where: { id },
    data: { name, initials: initialsOf(name), role: role as DbRole, groupId: input.groupId || null, active: input.active },
  });
  if (notes.length) await logAudit('USER', id, actor.id, notes.join('\n'));
}

/** ผู้ดูแลรีเซ็ตรหัสผ่าน: ออกรหัสชั่วคราว บังคับเปลี่ยนตอนเข้าครั้งถัดไป และทำให้ session เดิมของผู้ใช้หมดอายุ */
export async function resetPassword(actor: Actor, id: string): Promise<string> {
  assertCan(actor.role, 'user.manage');
  const target = await db.user.findUnique({ where: { id } });
  if (!target) throw new UserError('ไม่พบผู้ใช้');
  if (target.id === actor.id) throw new UserError('รีเซ็ตรหัสผ่านของตัวเองไม่ได้ — ใช้เมนู "บัญชีของฉัน" แทน');
  const tempPassword = generateTempPassword();
  await db.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(tempPassword, COST), mustChangePassword: true, passwordChangedAt: new Date() },
  });
  await logAudit('USER', id, actor.id, 'รีเซ็ตรหัสผ่าน (ออกรหัสชั่วคราว ต้องเปลี่ยนก่อนใช้งาน และ session เดิมหมดอายุ)');
  return tempPassword;
}

/** ผู้ใช้เปลี่ยนรหัสผ่านของตนเอง — ต้องยืนยันรหัสเดิม ผ่านนโยบาย และไม่ซ้ำเดิม */
export async function changeOwnPassword(userId: string, input: { current: string; next: string; confirm: string }) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserError('ไม่พบผู้ใช้');
  if (!user.passwordHash) throw new UserError('บัญชีนี้เข้าสู่ระบบผ่าน Microsoft จึงไม่มีรหัสผ่านให้เปลี่ยน');
  if (!(await bcrypt.compare(input.current, user.passwordHash))) throw new WrongPasswordError('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  if (input.next !== input.confirm) throw new UserError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
  const errs = validatePassword(input.next, { email: user.email, currentPassword: input.current });
  if (errs.length) throw new UserError(errs.join(' · '));
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(input.next, COST), mustChangePassword: false, passwordChangedAt: new Date() },
  });
  await logAudit('USER', userId, userId, 'เปลี่ยนรหัสผ่านด้วยตนเอง');
}
