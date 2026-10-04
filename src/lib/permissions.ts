import { DomainError } from './errors';

// สิทธิ์ตามบทบาท (CLAUDE.md): END_USER, AGENT, RESOLVER_GROUP_LEAD, CHANGE_MANAGER, CAB_MEMBER, CONFIG_MANAGER, ADMIN
// ใช้ฝั่งเซิร์ฟเวอร์ทุกครั้งที่มีการเปลี่ยนแปลงข้อมูล — การซ่อนปุ่มใน UI เป็นแค่ความสะดวก
export type Role = 'END_USER' | 'AGENT' | 'RESOLVER_GROUP_LEAD' | 'CHANGE_MANAGER' | 'CAB_MEMBER' | 'CONFIG_MANAGER' | 'ADMIN';

export type Action =
  | 'problem.manage'
  | 'change.create'
  | 'change.approve'
  | 'change.manage'
  | 'kb.manage'
  | 'kb.publish'
  | 'request.approve'
  | 'request.fulfil'
  | 'incident.manage'
  | 'cmdb.manage'
  | 'user.manage'
  | 'email.manage';

const RULES: Record<Action, Role[]> = {
  'problem.manage': ['AGENT', 'RESOLVER_GROUP_LEAD', 'ADMIN'],
  'change.create': ['AGENT', 'RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'ADMIN'],
  'change.approve': ['CAB_MEMBER', 'CHANGE_MANAGER', 'ADMIN'],
  'change.manage': ['RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'ADMIN'],
  'kb.manage': ['AGENT', 'RESOLVER_GROUP_LEAD', 'ADMIN'],
  'kb.publish': ['RESOLVER_GROUP_LEAD', 'ADMIN'],
  'request.approve': ['RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'ADMIN'],
  'request.fulfil': ['AGENT', 'RESOLVER_GROUP_LEAD', 'ADMIN'],
  // เจ้าหน้าที่ทุกบทบาท (ไม่รวมผู้ใช้ปลายทาง) ทำงานกับ Incident ได้ — ผู้ใช้ปลายทางทำได้เฉพาะผ่านพอร์ทัลกับรายการของตนเอง
  'incident.manage': ['AGENT', 'RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'CAB_MEMBER', 'CONFIG_MANAGER', 'ADMIN'],
  'cmdb.manage': ['AGENT', 'RESOLVER_GROUP_LEAD', 'CONFIG_MANAGER', 'ADMIN'],
  'user.manage': ['ADMIN'], // จัดการบัญชีผู้ใช้/บทบาท/รีเซ็ตรหัสผ่าน
  'email.manage': ['ADMIN'], // ดูคิวอีเมล/ส่งอีเมลทดสอบ
};

export function can(role: Role | null | undefined, action: Action): boolean {
  return !!role && RULES[action].includes(role);
}


export class PermissionError extends DomainError {
  constructor(action: Action) {
    super(`บทบาทของคุณไม่มีสิทธิ์ทำรายการนี้ (${action})`);
  }
}

export function assertCan(role: Role | null | undefined, action: Action): void {
  if (!can(role, action)) throw new PermissionError(action);
}

export const ROLE_LABEL: Record<Role, string> = {
  END_USER: 'ผู้ใช้ทั่วไป',
  AGENT: 'เจ้าหน้าที่ Service Desk',
  RESOLVER_GROUP_LEAD: 'หัวหน้ากลุ่มผู้แก้ไข',
  CHANGE_MANAGER: 'Change Manager',
  CAB_MEMBER: 'สมาชิก CAB',
  CONFIG_MANAGER: 'Configuration Manager',
  ADMIN: 'ผู้ดูแลระบบ',
};
