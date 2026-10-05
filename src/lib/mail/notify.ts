import type { Prisma, Role } from '@prisma/client';
import { db } from '../db';
import { formatDocNo } from '../docno';
import { th } from '@/i18n/th';
import { absoluteUrl } from './config';
import { enqueueMail } from './outbox';
import { excerpt, pickRecipients, type Recipient } from './rules';
import { summarize, TEMPLATE_META, type MailMessage, type NotifyCategory } from './templates';
import { formatRemaining, thDateShort, thWindow } from '../datetime';
import { timerView } from '../sla';
import { alertStep, daysLeft, licenseState } from '../asset';
import { bangkokYmd } from '../change';

// ทุกฟังก์ชันที่นี่ "ไม่โยน error" — การแจ้งเตือนล้มเหลวต้องไม่ทำให้งานหลัก (บันทึก Incident, อนุมัติ ฯลฯ) ล้มไปด้วย
async function safely(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error(`[notify] ${label} failed`, e instanceof Error ? e.message : e);
  }
}

const SELECT = { id: true, email: true, name: true, active: true, notifyAssigned: true, notifyCritical: true, notifyMyItems: true, notifyApprovals: true, notifySla: true, notifyAssets: true } satisfies Prisma.UserSelect;

const usersByIds = (ids: (string | null | undefined)[]): Promise<Recipient[]> => {
  const list = ids.filter((x): x is string => !!x);
  return list.length ? db.user.findMany({ where: { id: { in: list } }, select: SELECT }) : Promise.resolve([]);
};
const usersByRoles = (roles: Role[]): Promise<Recipient[]> => db.user.findMany({ where: { role: { in: roles }, active: true }, select: SELECT });

/** แจ้งเตือนในระบบ (กระดิ่ง) ควบคู่กับอีเมล — เนื้อหาชุดเดียวกัน ไม่ทำสำหรับอีเมลความปลอดภัยของบัญชี และไม่ทำให้งานหลักล้ม */
async function inApp(userId: string, category: NotifyCategory, message: MailMessage, dedupeKey?: string) {
  if (TEMPLATE_META[message.template].critical) return;
  try {
    const s = summarize(message);
    await db.notification.create({ data: { userId, category, title: s.title, body: s.body || null, href: s.href, dedupeKey } });
  } catch (e) {
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') return; // เคยแจ้งแล้ว (dedupe)
    console.error('[notify] in-app failed', e instanceof Error ? e.message : e);
  }
}

/** ส่งให้ทุกคนที่เลือกรับหมวดนี้ — ตัดผู้กระทำเอง (ไม่ต้องแจ้งสิ่งที่เพิ่งทำเอง) */
async function send(users: Recipient[], category: NotifyCategory, actorId: string | null | undefined, make: (u: Recipient) => MailMessage, dedupe?: (u: Recipient) => string) {
  for (const u of pickRecipients(users, category, actorId)) {
    const message = make(u);
    await enqueueMail(u.email, message, { dedupeKey: dedupe?.(u) });
    await inApp(u.id, category, message, dedupe?.(u));
  }
}

const incUrl = (seq: number) => absoluteUrl(`/incidents/${formatDocNo('INC', seq)}`);
const portalUrl = (seq: number) => absoluteUrl(`/portal/my/${formatDocNo('INC', seq)}`);

interface IncLike {
  id: string;
  seq: number;
  title: string;
  priority: string;
  isMajor?: boolean;
  assigneeId: string | null;
  reporterId: string | null;
  serviceId?: string | null;
}

const prio = (p: string) => th.priority[p as keyof typeof th.priority] ?? p;

/** Incident ที่ผู้ใช้แจ้งผ่านพอร์ทัล → ยืนยันว่ารับเรื่องแล้ว */
export const notifyIncidentReceived = (inc: IncLike) =>
  safely('incidentReceived', async () => {
    const docNo = formatDocNo('INC', inc.seq);
    await send(await usersByIds([inc.reporterId]), 'myItems', null, (u) => ({ template: 'incidentReceived', name: u.name, docNo, title: inc.title, url: portalUrl(inc.seq) }));
  });

/** มอบหมายให้ผู้รับผิดชอบใหม่ */
export const notifyAssigned = (inc: IncLike, actorId: string | null) =>
  safely('incidentAssigned', async () => {
    if (!inc.assigneeId) return;
    const docNo = formatDocNo('INC', inc.seq);
    const service = inc.serviceId ? (await db.service.findUnique({ where: { id: inc.serviceId }, select: { name: true } }))?.name : undefined;
    await send(await usersByIds([inc.assigneeId]), 'assigned', actorId, (u) => ({
      template: 'incidentAssigned', name: u.name, docNo, title: inc.title, priority: prio(inc.priority), service, url: incUrl(inc.seq),
    }));
  });

/** P1 หรือ Major Incident → หัวหน้าทีมและผู้ดูแล (ไม่รวมคนที่เป็นผู้ลงมือเอง) */
export const notifyCritical = (inc: IncLike, actorId: string | null) =>
  safely('incidentCritical', async () => {
    const docNo = formatDocNo('INC', inc.seq);
    await send(await usersByRoles(['RESOLVER_GROUP_LEAD', 'ADMIN']), 'critical', actorId, (u) => ({
      template: 'incidentCritical', name: u.name, docNo, title: inc.title, priority: prio(inc.priority), major: !!inc.isMajor, url: incUrl(inc.seq),
    }), (u) => `crit:${inc.id}:${inc.isMajor ? 'major' : inc.priority}:${u.id}`);
  });

/** ใครเขียนโน้ตที่ลูกค้าเห็น: เจ้าหน้าที่ → แจ้งผู้แจ้ง · ผู้แจ้งเอง → แจ้งผู้รับผิดชอบ */
export const notifyCustomerNote = (inc: IncLike, note: string, authorId: string | null) =>
  safely('incidentNote', async () => {
    const docNo = formatDocNo('INC', inc.seq);
    if (authorId && authorId === inc.reporterId) {
      await send(await usersByIds([inc.assigneeId]), 'assigned', authorId, (u) => ({
        template: 'incidentUserReplied', name: u.name, docNo, title: inc.title, note: excerpt(note), url: incUrl(inc.seq),
      }));
    } else {
      await send(await usersByIds([inc.reporterId]), 'myItems', authorId, (u) => ({
        template: 'incidentUpdateForUser', name: u.name, docNo, title: inc.title, note: excerpt(note), url: portalUrl(inc.seq),
      }));
    }
  });

export const notifyResolved = (inc: IncLike, note: string, actorId: string | null) =>
  safely('incidentResolved', async () => {
    const docNo = formatDocNo('INC', inc.seq);
    await send(await usersByIds([inc.reporterId]), 'myItems', actorId, (u) => ({
      template: 'incidentResolved', name: u.name, docNo, title: inc.title, note: excerpt(note), url: portalUrl(inc.seq),
    }));
  });

// ── Change ──
export const notifyChangeApprovalRequest = (changeId: string, actorId: string | null) =>
  safely('changeApprovalRequest', async () => {
    const c = await db.change.findUnique({ where: { id: changeId }, include: { approvals: true } });
    if (!c) return;
    const docNo = formatDocNo('CHG', c.seq);
    const pending = c.approvals.filter((a) => a.decision === 'PENDING').map((a) => a.approverId);
    await send(await usersByIds(pending), 'approvals', actorId, (u) => ({
      template: 'changeApprovalRequest', name: u.name, docNo, title: c.title, type: th.changeType[c.type], board: c.cabApproval ?? 'CAB',
      window: `${thDateShort(c.windowStart)} ${thWindow(c.windowStart, c.windowEnd)} น.`, url: absoluteUrl(`/changes/${docNo}`),
    }));
  });

export const notifyChangeDecision = (changeId: string, approved: boolean, comment: string | undefined, actorId: string | null) =>
  safely('changeDecision', async () => {
    const c = await db.change.findUnique({ where: { id: changeId } });
    if (!c?.requesterId) return;
    await send(await usersByIds([c.requesterId]), 'myItems', actorId, (u) => ({
      template: 'changeDecision', name: u.name, docNo: formatDocNo('CHG', c.seq), title: c.title, approved, comment: comment?.trim() || undefined, url: absoluteUrl(`/changes/${formatDocNo('CHG', c.seq)}`),
    }));
  });

// ── Service Request ──
export const notifyRequestApprovalNeeded = (requestId: string) =>
  safely('requestApprovalNeeded', async () => {
    const r = await db.serviceRequest.findUnique({ where: { id: requestId }, include: { requester: true } });
    if (!r) return;
    await send(await usersByRoles(['RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'ADMIN']), 'approvals', r.requesterId, (u) => ({
      template: 'requestApprovalNeeded', name: u.name, docNo: formatDocNo('REQ', r.seq), title: r.title, requester: r.requester?.name ?? '-', url: absoluteUrl(`/requests/${formatDocNo('REQ', r.seq)}`),
    }));
  });

export const notifyRequestStatus = (requestId: string, state: 'APPROVED' | 'REJECTED' | 'DELIVERED', note: string | undefined, actorId: string | null) =>
  safely('requestStatus', async () => {
    const r = await db.serviceRequest.findUnique({ where: { id: requestId } });
    if (!r?.requesterId) return;
    const docNo = formatDocNo('REQ', r.seq);
    await send(await usersByIds([r.requesterId]), 'myItems', actorId, (u) => ({
      template: 'requestStatus', name: u.name, docNo, title: r.title, state, note: note?.trim() || undefined, url: absoluteUrl(`/portal/my/${docNo}`),
    }));
  });

// ── SLA ──
const MIN = 60_000;

/**
 * ตรวจ SLA timer ที่กำลังเดิน: ใกล้ผิด (เหลือ ≤ 25%) และผิดกำหนดแล้ว — ส่งอย่างละครั้งต่อ timer
 * จองด้วยการ update แบบมีเงื่อนไข (notifiedAt = null) เพื่อไม่ให้หลาย instance ส่งซ้ำกัน
 */
export async function processSlaAlerts(now = new Date()): Promise<{ near: number; breached: number }> {
  const out = { near: 0, breached: 0 };
  const timers = await db.slaTimer.findMany({
    where: { achievedAt: null, pausedAt: null, state: { in: ['RUNNING'] }, OR: [{ nearNotifiedAt: null }, { breachNotifiedAt: null }] },
    include: { incident: true },
  });
  for (const t of timers) {
    const inc = t.incident;
    if (inc.status === 'CLOSED' || inc.status === 'RESOLVED') continue;
    const v = timerView(t, now);
    const wantBreach = v.state === 'BREACHED' && !t.breachNotifiedAt;
    const wantNear = !wantBreach && v.near && !t.nearNotifiedAt && !t.breachNotifiedAt;
    if (!wantBreach && !wantNear) continue;

    const claim = await db.slaTimer.updateMany({
      where: { id: t.id, ...(wantBreach ? { breachNotifiedAt: null } : { nearNotifiedAt: null }) },
      data: wantBreach ? { breachNotifiedAt: now, nearNotifiedAt: t.nearNotifiedAt ?? now } : { nearNotifiedAt: now },
    });
    if (claim.count !== 1) continue;

    await safely('sla', async () => {
      const docNo = formatDocNo('INC', inc.seq);
      const who = inc.assigneeId ? await usersByIds([inc.assigneeId]) : await usersByRoles(['RESOLVER_GROUP_LEAD']);
      const metric = t.metric === 'RESPONSE' ? 'ตอบสนอง' : 'แก้ไข';
      const title = `${inc.title} (${metric})`;
      if (wantBreach) {
        const over = Math.max(1, Math.round(-v.leftMs / MIN));
        const overrun = over >= 60 ? `${Math.floor(over / 60)} ชม. ${over % 60} นาที` : `${over} นาที`;
        await send(who, 'sla', null, (u) => ({ template: 'slaBreached', name: u.name, docNo, title, priority: prio(inc.priority), overrun, url: incUrl(inc.seq) }));
        out.breached++;
      } else {
        await send(who, 'sla', null, (u) => ({ template: 'slaNearBreach', name: u.name, docNo, title, priority: prio(inc.priority), left: formatRemaining(Math.round(v.leftMs / MIN)), url: incUrl(inc.seq) }));
        out.near++;
      }
    });
  }
  return out;
}

// ── สินทรัพย์: ประกัน/ไลเซนส์ใกล้หมด และไลเซนส์ใช้เกินสิทธิ์ ──

/**
 * ตรวจสินทรัพย์หนึ่งรายการแล้วแจ้งเตือนผู้เกี่ยวข้อง: เจ้าของ CI + ผู้จัดการ CMDB + ผู้ดูแล (ตามค่าตั้งหมวด "ประกัน/ไลเซนส์")
 * ส่งครั้งเดียวต่อขั้น (เหลือ ≤ 90 / ≤ 30 / ≤ 7 วัน / หมดแล้ว) ต่อวันหมดอายุ — กุญแจกันซ้ำรวมวันหมดอายุไว้ ต่ออายุแล้วเริ่มนับใหม่
 * ไลเซนส์ใช้เกินสิทธิ์แจ้งครั้งเดียวต่อจำนวนสิทธิ์ที่ซื้อ · ไม่โยน error (ห้ามทำให้การแก้ไขสินทรัพย์ล้ม)
 */
export const checkAssetAlerts = (assetId: string, now = new Date()) =>
  safely('assetAlerts', async () => {
    const a = await db.asset.findUnique({ where: { id: assetId }, include: { ci: { select: { name: true, ciClass: true, ownerUserId: true } } } });
    if (!a || a.status === 'RETIRED') return;
    const owner = a.ci.ownerUserId;
    const users = await db.user.findMany({ where: { active: true, OR: [...(owner ? [{ id: owner }] : []), { role: { in: ['CONFIG_MANAGER', 'ADMIN'] as Role[] } }] }, select: SELECT });
    const url = absoluteUrl(`/assets/${a.assetTag}`);
    const license = a.ci.ciClass === 'SOFTWARE_LICENSE';
    if (a.supportUntil) {
      const days = daysLeft(a.supportUntil, now);
      const step = alertStep(days);
      if (step !== null) {
        const key = `asset:${a.id}:${bangkokYmd(a.supportUntil)}:${step}`;
        await send(users, 'assets', null, (u) => ({ template: 'assetExpiring', name: u.name, tag: a.assetTag, assetName: a.ci.name, kind: license ? 'license' : 'support', expires: thDateShort(a.supportUntil as Date), days, url }), (u) => `${key}:${u.id}`);
      }
    }
    if (license && a.licenseQty != null && a.licenseUsed != null && licenseState(a.licenseQty, a.licenseUsed) === 'OVER') {
      const key = `asset:${a.id}:over:${a.licenseQty}`;
      const [used, qty] = [a.licenseUsed, a.licenseQty];
      await send(users, 'assets', null, (u) => ({ template: 'licenseOverUse', name: u.name, tag: a.assetTag, assetName: a.ci.name, used, qty, url }), (u) => `${key}:${u.id}`);
    }
  });

/** ตรวจสินทรัพย์ทั้งหมดที่เข้าเกณฑ์ (ใกล้หมด/หมดแล้ว/ไลเซนส์) — เรียกเป็นรอบจาก worker; คืนจำนวนที่ตรวจ */
export async function processAssetAlerts(now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 92 * 86_400_000);
  const rows = await db.asset.findMany({
    where: { status: { not: 'RETIRED' }, OR: [{ supportUntil: { lte: horizon } }, { licenseQty: { not: null }, licenseUsed: { not: null } }] },
    select: { id: true },
  });
  for (const r of rows) await checkAssetAlerts(r.id, now);
  return rows.length;
}

// ── Release ──

const relUrl = (seq: number) => absoluteUrl(`/releases/${formatDocNo('REL', seq)}`);
const relWindow = (r: { windowStart: Date | null; windowEnd: Date | null }) => (r.windowStart ? `${thDateShort(r.windowStart)} ${thWindow(r.windowStart, r.windowEnd)} น.` : undefined);

export type ReleaseEvent = 'READY' | 'NO_GO' | 'DEPLOYING' | 'DEPLOYED' | 'ROLLED_BACK' | 'CANCELLED';

/**
 * Release เปลี่ยนสถานะ → แจ้งเจ้าของ Release และผู้ขอ Change ในแพ็กเกจ (ตัดผู้กระทำเอง)
 * changeIds ส่งมาจากผู้เรียก (ก่อนปล่อย Change ออกกรณียกเลิก) เพื่อให้ผู้ขอของ Change เหล่านั้นยังได้รับแจ้ง
 */
export const notifyReleaseStatus = (releaseId: string, event: ReleaseEvent, reason: string | undefined, actorId: string | null, changeIds: string[]) =>
  safely('releaseStatus', async () => {
    const r = await db.release.findUnique({ where: { id: releaseId } });
    if (!r) return;
    const requesters = changeIds.length ? await db.change.findMany({ where: { id: { in: changeIds } }, select: { requesterId: true } }) : [];
    const ids = [...new Set([r.ownerId, ...requesters.map((c) => c.requesterId)].filter((x): x is string => !!x))];
    const docNo = formatDocNo('REL', r.seq);
    await send(await usersByIds(ids), 'myItems', actorId, (u) => ({
      template: 'releaseStatus', name: u.name, docNo, releaseName: r.name, event, reason: reason?.trim() ? excerpt(reason, 400) : undefined, window: relWindow(r), changes: changeIds.length, url: relUrl(r.seq),
    }));
  });

/** มอบ/เปลี่ยนเจ้าของ Release → แจ้งเจ้าของใหม่ (ถ้าไม่ใช่ผู้กระทำเอง) */
export const notifyReleaseOwner = (releaseId: string, actorId: string | null) =>
  safely('releaseOwner', async () => {
    const r = await db.release.findUnique({ where: { id: releaseId } });
    if (!r?.ownerId) return;
    await send(await usersByIds([r.ownerId]), 'assigned', actorId, (u) => ({ template: 'releaseOwner', name: u.name, docNo: formatDocNo('REL', r.seq), releaseName: r.name, window: relWindow(r), url: relUrl(r.seq) }));
  });
