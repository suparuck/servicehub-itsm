import type { Level } from '@prisma/client';
import { logAudit } from './audit';
import { db } from './db';
import { formatDocNo } from './docno';
import { DomainError } from './errors';
import { OPEN_STATUSES } from './incident';
import { changeStatus, createIncident } from './incidentService';
import { notifyAssigned, notifyIncidentReceived } from './mail/notify';
import { assertCan, type Role } from './permissions';
import { submitRequest } from './portalService';
import { buildQueue, pickRule, validateMacro, validateOnBehalf, validateRule, type QueueIncident, type QueueRequest } from './serviceDesk';

export class DeskError extends DomainError {}
type Actor = { id: string; role: Role; name?: string };

const OPEN_REQ = ['SUBMITTED', 'PENDING_APPROVAL', 'FULFILLING'] as const;
const STAFF_ROLES = ['AGENT', 'RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'CONFIG_MANAGER', 'ADMIN'] as const;

// ── คิวรวม ──────────────────────────────────────────────────

export async function loadQueue(now = new Date()) {
  const [incidents, requests] = await Promise.all([
    db.incident.findMany({
      where: { status: { in: OPEN_STATUSES } },
      include: { assignee: { select: { name: true } }, reporter: { select: { name: true } }, timers: true },
    }),
    db.serviceRequest.findMany({ where: { status: { in: [...OPEN_REQ] } }, include: { requester: { select: { name: true } } } }),
  ]);
  const qi: QueueIncident[] = incidents.map((i) => ({
    id: i.id, seq: i.seq, title: i.title, priority: i.priority, status: i.status, channel: i.channel, createdAt: i.createdAt, assigneeId: i.assigneeId,
    assigneeName: i.assignee?.name ?? null, reporterName: i.reporter?.name ?? null, isMajor: i.isMajor,
    timers: i.timers.map((t) => ({ metric: t.metric, startedAt: t.startedAt, dueAt: t.dueAt, targetMinutes: t.targetMinutes, achievedAt: t.achievedAt, pausedAt: t.pausedAt, state: t.state })),
  }));
  const qr: QueueRequest[] = requests.map((r) => ({ id: r.id, seq: r.seq, title: r.title, status: r.status, createdAt: r.createdAt, requesterName: r.requester?.name ?? null }));
  return buildQueue(qi, qr, now);
}

export async function queueChannels() {
  const rows = await db.incident.findMany({ where: { status: { in: OPEN_STATUSES }, channel: { not: null } }, select: { channel: true }, distinct: ['channel'], orderBy: { channel: 'asc' } });
  return rows.map((r) => r.channel as string);
}

export const staffUsers = () => db.user.findMany({ where: { active: true, role: { in: [...STAFF_ROLES] } }, orderBy: { name: 'asc' }, select: { id: true, name: true } });

// ── รับงาน / มอบหมาย ───────────────────────────────────────

async function loadOpenIncident(id: string) {
  const inc = await db.incident.findUnique({ where: { id }, include: { assignee: { select: { name: true } } } });
  if (!inc) throw new DeskError('ไม่พบ Incident');
  if (inc.status === 'RESOLVED' || inc.status === 'CLOSED') throw new DeskError('Incident นี้แก้ไขหรือปิดแล้ว มอบหมายไม่ได้');
  return inc;
}

/** รับงานที่ยังไม่มีผู้รับผิดชอบ — updateMany แบบมีเงื่อนไข (assigneeId = null) สองคนกดพร้อมกันได้คนเดียว */
export async function claimIncident(actor: Actor, id: string) {
  assertCan(actor.role, 'incident.manage');
  const inc = await loadOpenIncident(id);
  const won = await db.incident.updateMany({ where: { id, assigneeId: null }, data: { assigneeId: actor.id } });
  if (won.count !== 1) throw new DeskError(`มีผู้รับผิดชอบแล้ว${inc.assignee ? ` (${inc.assignee.name})` : ''}`);
  await finishAssign(inc.id, inc.status, actor.id, 'รับงานจากคิว Service Desk');
}

/** มอบหมายให้ผู้อื่น (หัวหน้าทีม/ผู้ดูแล) — เปลี่ยนผู้รับผิดชอบได้แม้มีคนรับอยู่แล้ว */
export async function assignIncident(actor: Actor, id: string, assigneeId: string) {
  assertCan(actor.role, 'servicedesk.manage');
  const inc = await loadOpenIncident(id);
  const target = await db.user.findFirst({ where: { id: assigneeId, active: true, role: { in: [...STAFF_ROLES] } }, select: { id: true, name: true } });
  if (!target) throw new DeskError('ไม่พบผู้รับผิดชอบที่เลือก (ต้องเป็นเจ้าหน้าที่ที่ยังใช้งานอยู่)');
  if (inc.assigneeId === target.id) throw new DeskError('Incident นี้มอบหมายให้ผู้นี้อยู่แล้ว');
  await db.incident.update({ where: { id }, data: { assigneeId: target.id } });
  await finishAssign(inc.id, inc.status, actor.id, `มอบหมายให้ ${target.name}`);
  const fresh = await db.incident.findUnique({ where: { id } });
  if (fresh) await notifyAssigned(fresh, actor.id);
}

/** สถานะใหม่ → มอบหมายแล้ว (เดิน SLA response ผ่านกติกาเดิมของ changeStatus) + บันทึกโน้ตภายใน */
async function finishAssign(id: string, status: string, userId: string, text: string) {
  if (status === 'NEW') await changeStatus(id, 'ASSIGNED', userId, text);
  else await db.workNote.create({ data: { incidentId: id, authorId: userId, kind: 'มอบหมาย', visibility: 'INTERNAL', tone: 'ink', body: text } });
}

// ── บันทึกแทนผู้ใช้ ─────────────────────────────────────────

export interface OnBehalfInput {
  callerId: string;
  channel: string;
  type: string;
  title: string;
  description: string;
  impact: string;
  urgency: string;
  serviceId: string;
  catalogId: string;
}

const LEVELS: Level[] = ['HIGH', 'MED', 'LOW'];

export async function logOnBehalf(actor: Actor, input: OnBehalfInput): Promise<{ docNo: string; href: string; ruled: string | null }> {
  assertCan(actor.role, 'incident.manage');
  const errs = validateOnBehalf(input);
  if (errs.length) throw new DeskError(errs.join(' · '));
  const caller = await db.user.findFirst({ where: { id: input.callerId, active: true }, select: { id: true, name: true } });
  if (!caller) throw new DeskError('ไม่พบผู้แจ้งที่เลือก หรือบัญชีถูกปิดแล้ว');
  const title = input.title.trim();
  const actorName = actor.name ?? 'Service Desk';

  if (input.type === 'REQ') {
    const req = await submitRequest(caller.id, { catalogId: input.catalogId, title, description: input.description });
    await logAudit('REQUEST', req.id, actor.id, `บันทึกแทนผู้ใช้ ${caller.name} ผ่านช่องทาง${input.channel} โดย ${actorName}`);
    const docNo = formatDocNo('REQ', req.seq);
    return { docNo, href: `/requests/${docNo}`, ruled: null };
  }

  if (!LEVELS.includes(input.impact as Level) || !LEVELS.includes(input.urgency as Level)) throw new DeskError('กรุณาเลือกผลกระทบและความเร่งด่วน');
  const service = input.serviceId ? await db.service.findUnique({ where: { id: input.serviceId } }) : null;
  if (input.serviceId && !service) throw new DeskError('ไม่พบบริการที่เลือก');
  // กฎมอบหมายอัตโนมัติ: ใช้เมื่อยังไม่มีทางไปต่อ (Service Desk ไม่ได้ระบุกลุ่ม/ผู้รับผิดชอบเอง)
  const rules = await db.assignmentRule.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, include: { group: { select: { name: true } }, assignee: { select: { id: true, active: true, name: true } } } });
  const rule = pickRule(rules, service?.id);
  const assigneeId = rule?.assignee?.active ? rule.assignee.id : null;
  const inc = await createIncident(
    {
      title, description: input.description.trim(), impact: input.impact as Level, urgency: input.urgency as Level, serviceId: service?.id ?? null,
      groupId: rule?.groupId ?? null, assigneeId, category: service?.category ?? null, channel: input.channel, reporterId: caller.id,
    },
    actor.id,
  );
  await db.workNote.create({
    data: {
      incidentId: inc.id, authorId: actor.id, kind: 'Service Desk', visibility: 'INTERNAL', tone: 'ink',
      body: `บันทึกแทน ${caller.name} ผ่านช่องทาง${input.channel} โดย ${actorName}${rule ? ` · มอบหมายอัตโนมัติตามกฎ “${rule.name}” → ${rule.group.name}${rule.assignee ? ` / ${rule.assignee.name}` : ''}` : ''}`,
    },
  });
  await notifyIncidentReceived(inc);
  const docNo = formatDocNo('INC', inc.seq);
  return { docNo, href: `/incidents/${docNo}`, ruled: rule ? rule.name : null };
}

export async function deskFormOptions() {
  const [callers, services, catalog] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
    db.service.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
    db.catalogItem.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);
  return { callers, services, catalog };
}

// ── กฎมอบหมายอัตโนมัติ ─────────────────────────────────────

export const listRules = () =>
  db.assignmentRule.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { service: { select: { name: true } }, group: { select: { name: true } }, assignee: { select: { name: true } } } });

export const ruleOptions = async () => {
  const [services, groups, users] = await Promise.all([
    db.service.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
    db.assignmentGroup.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    staffUsers(),
  ]);
  return { services, groups, users };
};

export async function createRule(actor: Actor, input: { name: string; serviceId: string; groupId: string; assigneeId: string; sortOrder: string }) {
  assertCan(actor.role, 'servicedesk.manage');
  const { errors, clean } = validateRule(input);
  if (errors.length) throw new DeskError(errors.join(' · '));
  if (clean.serviceId && !(await db.service.findUnique({ where: { id: clean.serviceId }, select: { id: true } }))) throw new DeskError('ไม่พบบริการที่เลือก');
  if (!(await db.assignmentGroup.findUnique({ where: { id: clean.groupId }, select: { id: true } }))) throw new DeskError('ไม่พบกลุ่มที่เลือก');
  const assigneeId = input.assigneeId.trim() || null;
  if (assigneeId && !(await db.user.findFirst({ where: { id: assigneeId, active: true, role: { in: [...STAFF_ROLES] } }, select: { id: true } }))) throw new DeskError('ไม่พบผู้รับผิดชอบที่เลือก');
  const r = await db.assignmentRule.create({ data: { ...clean, assigneeId } });
  await logAudit('DESK', 'rules', actor.id, `เพิ่มกฎมอบหมายอัตโนมัติ “${r.name}”`);
}

export async function setRuleActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor.role, 'servicedesk.manage');
  const r = await db.assignmentRule.findUnique({ where: { id } });
  if (!r) throw new DeskError('ไม่พบกฎ');
  await db.assignmentRule.update({ where: { id }, data: { active } });
  await logAudit('DESK', 'rules', actor.id, `${active ? 'เปิด' : 'ปิด'}กฎมอบหมายอัตโนมัติ “${r.name}”`);
}

export async function deleteRule(actor: Actor, id: string) {
  assertCan(actor.role, 'servicedesk.manage');
  const r = await db.assignmentRule.findUnique({ where: { id } });
  if (!r) throw new DeskError('ไม่พบกฎ');
  await db.assignmentRule.delete({ where: { id } });
  await logAudit('DESK', 'rules', actor.id, `ลบกฎมอบหมายอัตโนมัติ “${r.name}”`);
}

// ── ข้อความสำเร็จรูป ───────────────────────────────────────

export const listMacros = () => db.cannedResponse.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
export const activeMacros = () => db.cannedResponse.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, title: true, body: true } });

export async function createMacro(actor: Actor, input: { title: string; body: string; sortOrder: string }) {
  assertCan(actor.role, 'servicedesk.manage');
  const { errors, clean } = validateMacro(input);
  if (errors.length) throw new DeskError(errors.join(' · '));
  await db.cannedResponse.create({ data: clean });
  await logAudit('DESK', 'macros', actor.id, `เพิ่มข้อความสำเร็จรูป “${clean.title}”`);
}

export async function setMacroActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor.role, 'servicedesk.manage');
  const m = await db.cannedResponse.findUnique({ where: { id } });
  if (!m) throw new DeskError('ไม่พบข้อความ');
  await db.cannedResponse.update({ where: { id }, data: { active } });
  await logAudit('DESK', 'macros', actor.id, `${active ? 'เปิด' : 'ปิด'}ข้อความสำเร็จรูป “${m.title}”`);
}

export async function deleteMacro(actor: Actor, id: string) {
  assertCan(actor.role, 'servicedesk.manage');
  const m = await db.cannedResponse.findUnique({ where: { id } });
  if (!m) throw new DeskError('ไม่พบข้อความ');
  await db.cannedResponse.delete({ where: { id } });
  await logAudit('DESK', 'macros', actor.id, `ลบข้อความสำเร็จรูป “${m.title}”`);
}

