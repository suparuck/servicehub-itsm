import type { EventSeverity, EventStatus, Prisma } from '@prisma/client';
import { logAudit } from './audit';
import { db } from './db';
import { formatDocNo } from './docno';
import { DomainError } from './errors';
import { createIncident } from './incidentService';
import { generateToken, hashToken } from './mail/tokens';
import { assertCan, type Role } from './permissions';
import { pickRule } from './serviceDesk';
import { INCIDENT_LEVELS, TOKEN_PREFIX, ciHealth, clean, decide, dedupKey, incidentTitle, severityRank, shouldAutoIncident, type IncomingEvent } from './monitoring';

export class MonitoringError extends DomainError {}
type Actor = { id: string; role: Role };

const KEEP_RESOLVED_DAYS = 30;

// ── แหล่งเหตุการณ์ ─────────────────────────────────────────

const newToken = () => {
  const t = `${TOKEN_PREFIX}${generateToken().token}`;
  return { token: t, hash: hashToken(t) };
};

export const listSources = () => db.monitoringSource.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { events: true } } } });

/** สร้างแหล่งใหม่ — คืน token จริงครั้งเดียว (ในฐานข้อมูลเก็บเฉพาะแฮช) */
export async function createSource(actor: Actor, nameRaw: string) {
  assertCan(actor.role, 'monitoring.admin');
  const name = clean(nameRaw, 80);
  if (!name) throw new MonitoringError('กรุณาระบุชื่อแหล่งเหตุการณ์');
  if (await db.monitoringSource.findUnique({ where: { name }, select: { id: true } })) throw new MonitoringError('มีแหล่งเหตุการณ์ชื่อนี้แล้ว');
  const { token, hash } = newToken();
  const s = await db.monitoringSource.create({ data: { name, tokenHash: hash } });
  await logAudit('MONITORING', 'sources', actor.id, `เพิ่มแหล่งเหตุการณ์ “${name}”`);
  return { id: s.id, name, token };
}

/** หมุนเวียน token — token เดิมใช้ไม่ได้ทันที */
export async function rotateSourceToken(actor: Actor, id: string) {
  assertCan(actor.role, 'monitoring.admin');
  const s = await db.monitoringSource.findUnique({ where: { id } });
  if (!s) throw new MonitoringError('ไม่พบแหล่งเหตุการณ์');
  const { token, hash } = newToken();
  await db.monitoringSource.update({ where: { id }, data: { tokenHash: hash } });
  await logAudit('MONITORING', 'sources', actor.id, `หมุนเวียน token ของ “${s.name}” (token เดิมใช้ไม่ได้แล้ว)`);
  return { id, name: s.name, token };
}

export async function updateSource(actor: Actor, id: string, patch: { active?: boolean; autoIncident?: boolean }) {
  assertCan(actor.role, 'monitoring.admin');
  const s = await db.monitoringSource.findUnique({ where: { id } });
  if (!s) throw new MonitoringError('ไม่พบแหล่งเหตุการณ์');
  const data: Prisma.MonitoringSourceUpdateInput = {};
  const notes: string[] = [];
  if (patch.active !== undefined && patch.active !== s.active) { data.active = patch.active; notes.push(patch.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'); }
  if (patch.autoIncident !== undefined && patch.autoIncident !== s.autoIncident) { data.autoIncident = patch.autoIncident; notes.push(patch.autoIncident ? 'เปิดสร้าง Incident อัตโนมัติ' : 'ปิดสร้าง Incident อัตโนมัติ'); }
  if (!notes.length) return;
  await db.monitoringSource.update({ where: { id }, data });
  await logAudit('MONITORING', 'sources', actor.id, `${notes.join(' · ')}: “${s.name}”`);
}

/** ยืนยันตัวตนของแหล่งจาก token (ค้นด้วยแฮช — ไม่เปรียบเทียบ token ดิบ) · คืน null เมื่อไม่ถูกต้องหรือถูกปิด */
export async function authenticateSource(token: string) {
  const s = await db.monitoringSource.findUnique({ where: { tokenHash: hashToken(token) } });
  return s && s.active ? s : null;
}

// ── รับเหตุการณ์ ───────────────────────────────────────────

async function resolveCi(ref: string | null) {
  if (!ref) return null;
  return db.configurationItem.findFirst({
    where: { lifecycle: { not: 'RETIRED' }, OR: [{ ciId: { equals: ref, mode: 'insensitive' } }, { name: { equals: ref, mode: 'insensitive' } }] },
    select: { id: true, ciId: true, name: true },
  });
}

export interface IngestResult {
  action: 'created' | 'updated' | 'resolved' | 'ignored';
  eventId?: string;
  incident?: string;
}

/**
 * รับเหตุการณ์ของแหล่งหนึ่ง: รวมเหตุการณ์ซ้ำ (ล็อกด้วย advisory lock ต่อกุญแจ — สองคำขอพร้อมกันไม่สร้างซ้ำ)
 * แล้วสร้าง Incident อัตโนมัติเมื่อผิดปกติ (CRITICAL) — คำขอที่ล้มเหลวภายหลังไม่ทำให้เหตุการณ์ที่บันทึกแล้วหาย
 */
export async function ingestEvent(source: { id: string; autoIncident: boolean }, e: IncomingEvent, now = new Date()): Promise<IngestResult> {
  const key = dedupKey(e);
  const ci = await resolveCi(e.ci);
  const title = clean(`${e.check}${e.ci ? ` — ${ci?.name ?? e.ci}` : ''}`, 200);

  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${source.id}:${key}`}))`;
    const open = await tx.monitoringEvent.findFirst({ where: { sourceId: source.id, dedupKey: key, status: { not: 'RESOLVED' } }, orderBy: { firstSeenAt: 'desc' } });
    const d = decide(open, e);
    await tx.monitoringSource.update({ where: { id: source.id }, data: { lastEventAt: now } });
    if (d.action === 'ignore') return { result: { action: 'ignored' } as IngestResult };
    if (d.action === 'resolve' && open) {
      await tx.monitoringEvent.update({ where: { id: open.id }, data: { status: 'RESOLVED', resolvedAt: now, resolvedBy: 'auto', lastSeenAt: now } });
      if (open.incidentId) {
        await tx.workNote.create({ data: { incidentId: open.incidentId, authorId: null, kind: 'Monitoring', visibility: 'INTERNAL', tone: 'ink', body: `ระบบเฝ้าระวังแจ้งว่ากลับสู่ปกติ (${e.check}) — ตรวจสอบและยืนยันก่อนปิด Incident` } });
      }
      return { result: { action: 'resolved', eventId: open.id } as IngestResult };
    }
    if (d.action === 'create') {
      const created = await tx.monitoringEvent.create({
        data: { sourceId: source.id, dedupKey: key, check: e.check, ciId: ci?.id ?? null, ciRef: e.ci, serviceCode: e.service, severity: d.severity, title, message: e.message, firstSeenAt: now, lastSeenAt: now },
      });
      return { result: { action: 'created', eventId: created.id } as IngestResult, event: created };
    }
    if (d.action === 'update' && open) {
      const updated = await tx.monitoringEvent.update({
        where: { id: open.id },
        data: { severity: d.severity, status: d.reopenStatus, occurrences: d.occurrences, lastSeenAt: now, message: e.message ?? open.message, ciId: ci?.id ?? open.ciId, serviceCode: e.service ?? open.serviceCode, ...(d.reopenStatus === 'OPEN' ? { ackedAt: null, ackedById: null } : {}) },
      });
      return { result: { action: 'updated', eventId: open.id } as IngestResult, event: updated };
    }
    return { result: { action: 'ignored' } as IngestResult };
  });

  const ev = 'event' in outcome ? outcome.event : undefined;
  if (ev && shouldAutoIncident(source.autoIncident, ev.severity, ev.incidentId)) {
    try {
      const doc = await openIncidentFor(ev.id, null, 'อัตโนมัติ');
      if (doc) outcome.result.incident = doc;
    } catch (err) {
      console.error('[monitoring] auto incident failed', err instanceof Error ? err.message : err);
    }
  }
  return outcome.result;
}

/**
 * สร้าง Incident จากเหตุการณ์ — จองสิทธิ์ด้วย updateMany (incidentRequestedAt = null) ผู้ชนะคนเดียวสร้าง
 * คืนเลขที่ Incident หรือ null ถ้ามีคนสร้าง/กำลังสร้างอยู่แล้ว
 */
async function openIncidentFor(eventId: string, actorId: string | null, how: string): Promise<string | null> {
  const won = await db.monitoringEvent.updateMany({ where: { id: eventId, incidentRequestedAt: null, incidentId: null }, data: { incidentRequestedAt: new Date() } });
  if (won.count !== 1) return null;
  try {
    const ev = await db.monitoringEvent.findUniqueOrThrow({ where: { id: eventId }, include: { source: { select: { name: true } } } });
    const service = ev.serviceCode ? await db.service.findUnique({ where: { code: ev.serviceCode } }) : null;
    const rules = await db.assignmentRule.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, include: { assignee: { select: { id: true, active: true } } } });
    const rule = pickRule(rules, service?.id);
    const inc = await createIncident(
      {
        title: incidentTitle(ev), description: [ev.message, `แหล่ง: ${ev.source.name}`, `ความรุนแรง: ${ev.severity}`, `จำนวนครั้งที่พบ: ${ev.occurrences}`].filter(Boolean).join('\n'),
        impact: INCIDENT_LEVELS.impact, urgency: INCIDENT_LEVELS.urgency, serviceId: service?.id ?? null, groupId: rule?.groupId ?? null,
        assigneeId: rule?.assignee?.active ? rule.assignee.id : null, category: service?.category ?? null, channel: 'Monitoring', ciIds: ev.ciId ? [ev.ciId] : [],
      },
      actorId,
    );
    await db.monitoringEvent.update({ where: { id: eventId }, data: { incidentId: inc.id } });
    await db.workNote.create({ data: { incidentId: inc.id, authorId: actorId, kind: 'Monitoring', visibility: 'INTERNAL', tone: 'ink', body: `สร้าง${how}จากเหตุการณ์เฝ้าระวัง “${ev.check}”${ev.ciRef ? ` ของ ${ev.ciRef}` : ''} (แหล่ง ${ev.source.name})` } });
    return formatDocNo('INC', inc.seq);
  } catch (err) {
    await db.monitoringEvent.update({ where: { id: eventId }, data: { incidentRequestedAt: null } }); // คืนสิทธิ์ ให้ลองใหม่ได้
    throw err;
  }
}

// ── ดู/จัดการเหตุการณ์ ─────────────────────────────────────

export interface EventFilters {
  q?: string;
  status?: string; // active (ค่าเริ่มต้น: เปิด+รับทราบ) | all | OPEN | ACKNOWLEDGED | RESOLVED
  severity?: string;
  source?: string;
}

const SEVERITIES: EventSeverity[] = ['INFO', 'WARNING', 'CRITICAL'];
const STATUSES: EventStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];

export async function listEvents(f: EventFilters = {}) {
  const and: Prisma.MonitoringEventWhereInput[] = [];
  const status = f.status ?? 'active';
  if (status === 'active') and.push({ status: { not: 'RESOLVED' } });
  else if (STATUSES.includes(status as EventStatus)) and.push({ status: status as EventStatus });
  if (f.severity && SEVERITIES.includes(f.severity as EventSeverity)) and.push({ severity: f.severity as EventSeverity });
  if (f.source) and.push({ sourceId: f.source });
  const q = f.q?.trim();
  if (q) and.push({ OR: [{ check: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }, { ciRef: { contains: q, mode: 'insensitive' } }, { message: { contains: q, mode: 'insensitive' } }] });
  const rows = await db.monitoringEvent.findMany({
    where: and.length ? { AND: and } : {},
    orderBy: { lastSeenAt: 'desc' },
    take: 300,
    include: { source: { select: { name: true } }, ci: { select: { ciId: true, name: true } }, incident: { select: { seq: true } }, ackedBy: { select: { name: true } } },
  });
  // ผิดปกติก่อน แล้วเรียงตามเวลาล่าสุด
  return rows.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}

export async function eventsOverview(now = new Date()) {
  const [active, last24h, sources] = await Promise.all([
    db.monitoringEvent.findMany({ where: { status: { not: 'RESOLVED' } }, select: { severity: true, status: true, ciId: true } }),
    db.monitoringEvent.count({ where: { lastSeenAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
    db.monitoringSource.count({ where: { active: true } }),
  ]);
  const health = ciHealth(active.map((a) => ({ ciId: a.ciId, severity: a.severity, status: a.status })));
  return {
    critical: active.filter((a) => a.severity === 'CRITICAL').length,
    warning: active.filter((a) => a.severity === 'WARNING').length,
    info: active.filter((a) => a.severity === 'INFO').length,
    acknowledged: active.filter((a) => a.status === 'ACKNOWLEDGED').length,
    last24h,
    sources,
    ciCritical: [...health.values()].filter((h) => h === 'CRITICAL').length,
    ciWarning: [...health.values()].filter((h) => h === 'WARNING').length,
  };
}

/** CI ที่มีเหตุการณ์ค้างอยู่ พร้อมสุขภาพ (เสียก่อนเตือน) */
export async function affectedCis() {
  const active = await db.monitoringEvent.findMany({ where: { status: { not: 'RESOLVED' }, ciId: { not: null } }, select: { ciId: true, severity: true, status: true } });
  const health = ciHealth(active.map((a) => ({ ciId: a.ciId, severity: a.severity, status: a.status })));
  if (!health.size) return [];
  const cis = await db.configurationItem.findMany({ where: { id: { in: [...health.keys()] } }, select: { id: true, ciId: true, name: true, classLabel: true } });
  return cis.map((c) => ({ ...c, health: health.get(c.id)!, events: active.filter((a) => a.ciId === c.id).length })).sort((a, b) => (a.health === b.health ? a.name.localeCompare(b.name) : a.health === 'CRITICAL' ? -1 : 1));
}

async function loadEvent(id: string) {
  const e = await db.monitoringEvent.findUnique({ where: { id } });
  if (!e) throw new MonitoringError('ไม่พบเหตุการณ์');
  return e;
}

export async function acknowledgeEvent(actor: Actor, id: string) {
  assertCan(actor.role, 'incident.manage');
  const e = await loadEvent(id);
  if (e.status !== 'OPEN') throw new MonitoringError(e.status === 'RESOLVED' ? 'เหตุการณ์นี้กลับสู่ปกติแล้ว' : 'รับทราบไปแล้ว');
  const won = await db.monitoringEvent.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'ACKNOWLEDGED', ackedAt: new Date(), ackedById: actor.id } });
  if (won.count !== 1) throw new MonitoringError('สถานะเปลี่ยนไปแล้ว กรุณารีเฟรช');
  await logAudit('MONITORING', e.id, actor.id, `รับทราบเหตุการณ์ “${e.title}”`);
}

export async function resolveEvent(actor: Actor, id: string) {
  assertCan(actor.role, 'incident.manage');
  const e = await loadEvent(id);
  if (e.status === 'RESOLVED') throw new MonitoringError('เหตุการณ์นี้ปิดแล้ว');
  await db.monitoringEvent.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedBy: actor.id } });
  await logAudit('MONITORING', e.id, actor.id, `ปิดเหตุการณ์ด้วยมือ “${e.title}”`);
}

export async function createIncidentFromEvent(actor: Actor, id: string): Promise<string> {
  assertCan(actor.role, 'incident.manage');
  const e = await loadEvent(id);
  if (e.status === 'RESOLVED') throw new MonitoringError('เหตุการณ์นี้ปิดแล้ว');
  if (e.incidentId || e.incidentRequestedAt) throw new MonitoringError('เหตุการณ์นี้มี Incident แล้ว');
  const doc = await openIncidentFor(id, actor.id, 'โดยเจ้าหน้าที่');
  if (!doc) throw new MonitoringError('เหตุการณ์นี้มี Incident แล้ว');
  await logAudit('MONITORING', e.id, actor.id, `สร้าง Incident ${doc} จากเหตุการณ์ “${e.title}”`);
  return doc;
}

/** ลบเหตุการณ์ที่ปิดแล้วเก่ากว่า 30 วัน (เหตุการณ์ที่ยังเปิดอยู่ไม่ถูกลบ) */
export async function purgeOldEvents(now = new Date()) {
  const cutoff = new Date(now.getTime() - KEEP_RESOLVED_DAYS * 86_400_000);
  const r = await db.monitoringEvent.deleteMany({ where: { status: 'RESOLVED', resolvedAt: { lt: cutoff } } });
  return r.count;
}
