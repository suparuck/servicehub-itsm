import type { Prisma, ServiceHealth } from '@prisma/client';
import { db } from './db';
import { logAudit } from './audit';
import { validateCatalogItem, validateOffering, validateService, type ServiceInput } from './catalogue';
import { DomainError } from './errors';
import { assertCan, type Role } from './permissions';

export class CatalogueError extends DomainError {}
type Actor = { id: string; role: Role };

const OPEN_INC = { notIn: ['RESOLVED', 'CLOSED'] as ('RESOLVED' | 'CLOSED')[] };
const OPEN_CHG = { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] as ('COMPLETED' | 'FAILED' | 'CANCELLED')[] };

// ── ค้นหา/ดู ────────────────────────────────────────────────

export interface ServiceFilters {
  q?: string;
  category?: string;
  health?: string;
}

export async function listServices(f: ServiceFilters = {}) {
  const where: Prisma.ServiceWhereInput = {};
  const q = f.q?.trim();
  if (q) where.OR = [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { ownerName: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }];
  if (f.category) where.category = f.category;
  if (f.health && ['OK', 'DEGRADED', 'DOWN'].includes(f.health)) where.health = f.health as ServiceHealth;
  const rows = await db.service.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      sla: { select: { name: true } },
      _count: { select: { offerings: true, catalogItems: true } },
    },
  });
  // นับ Incident/Change ที่ยังเปิดอยู่ต่อบริการ ด้วย groupBy ครั้งเดียว (ไม่ใช่ N+1)
  const [inc, chg] = await Promise.all([
    db.incident.groupBy({ by: ['serviceId'], where: { status: OPEN_INC, serviceId: { not: null } }, _count: { _all: true } }),
    db.change.groupBy({ by: ['serviceId'], where: { status: OPEN_CHG, serviceId: { not: null } }, _count: { _all: true } }),
  ]);
  const incBy = new Map(inc.map((g) => [g.serviceId, g._count._all]));
  const chgBy = new Map(chg.map((g) => [g.serviceId, g._count._all]));
  return rows.map((s) => ({ ...s, openIncidents: incBy.get(s.id) ?? 0, openChanges: chgBy.get(s.id) ?? 0 }));
}

export async function listCategories() {
  const rows = await db.service.findMany({ where: { category: { not: null } }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } });
  return rows.map((r) => r.category as string);
}

export const listSlas = () => db.sla.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });

export async function getServiceDetail(code: string) {
  const s = await db.service.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      sla: { include: { targets: true } },
      offerings: { orderBy: { name: 'asc' } },
      catalogItems: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { requests: true } } } },
    },
  });
  if (!s) return null;
  const [incidents, changes] = await Promise.all([
    db.incident.findMany({ where: { serviceId: s.id, status: OPEN_INC }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, seq: true, title: true, priority: true, status: true } }),
    db.change.findMany({ where: { serviceId: s.id, status: OPEN_CHG }, orderBy: { windowStart: 'asc' }, take: 8, select: { id: true, seq: true, title: true, type: true, status: true, windowStart: true } }),
  ]);
  return { service: s, incidents, changes };
}

// ── แก้ไขทะเบียนบริการ ───────────────────────────────────────

async function requireSla(slaId: string | null) {
  if (slaId && !(await db.sla.findUnique({ where: { id: slaId }, select: { id: true } }))) throw new CatalogueError('ไม่พบ SLA ที่เลือก');
}

export async function createService(actor: Actor, input: ServiceInput) {
  assertCan(actor.role, 'catalogue.manage');
  const { errors, clean } = validateService(input, { requireCode: true });
  if (errors.length) throw new CatalogueError(errors.join(' · '));
  if (await db.service.findUnique({ where: { code: clean.code }, select: { id: true } })) throw new CatalogueError(`รหัสบริการ ${clean.code} มีอยู่แล้ว`);
  await requireSla(clean.slaId);
  const s = await db.service.create({ data: { code: clean.code, name: clean.name, fullName: clean.fullName, category: clean.category, ownerName: clean.ownerName, slaId: clean.slaId, sortOrder: clean.sortOrder } });
  await logAudit('SERVICE', s.id, actor.id, `เพิ่มบริการ ${s.code} — ${s.name}`);
  return s;
}

export async function updateService(actor: Actor, code: string, input: Omit<ServiceInput, 'code'>) {
  assertCan(actor.role, 'catalogue.manage');
  const cur = await db.service.findUnique({ where: { code } });
  if (!cur) throw new CatalogueError('ไม่พบบริการ');
  const { errors, clean } = validateService({ ...input, code }, { requireCode: false });
  if (errors.length) throw new CatalogueError(errors.join(' · '));
  await requireSla(clean.slaId);
  const changes: string[] = [];
  const diff = (label: string, a: unknown, b: unknown) => { if ((a ?? null) !== (b ?? null)) changes.push(`${label}: ${a ?? '—'} → ${b ?? '—'}`); };
  diff('ชื่อ', cur.name, clean.name);
  diff('ชื่อเต็ม', cur.fullName, clean.fullName);
  diff('หมวดหมู่', cur.category, clean.category);
  diff('เจ้าของ', cur.ownerName, clean.ownerName);
  diff('ลำดับ', cur.sortOrder, clean.sortOrder);
  if ((cur.slaId ?? null) !== clean.slaId) changes.push('เปลี่ยน SLA ที่ผูก');
  if (!changes.length) return;
  await db.service.update({ where: { code }, data: { name: clean.name, fullName: clean.fullName, category: clean.category, ownerName: clean.ownerName, slaId: clean.slaId, sortOrder: clean.sortOrder } });
  await logAudit('SERVICE', cur.id, actor.id, `แก้ไขบริการ\n${changes.join('\n')}`);
}

// ── ข้อเสนอบริการ ────────────────────────────────────────────

async function serviceByCode(code: string) {
  const s = await db.service.findUnique({ where: { code }, select: { id: true, code: true } });
  if (!s) throw new CatalogueError('ไม่พบบริการ');
  return s;
}

export async function addOffering(actor: Actor, code: string, input: { name: string; description: string }) {
  assertCan(actor.role, 'catalogue.manage');
  const s = await serviceByCode(code);
  const { errors, clean } = validateOffering(input);
  if (errors.length) throw new CatalogueError(errors.join(' · '));
  const dup = await db.serviceOffering.findFirst({ where: { serviceId: s.id, name: { equals: clean.name, mode: 'insensitive' } } });
  if (dup) throw new CatalogueError('มีข้อเสนอบริการชื่อนี้ในบริการนี้แล้ว');
  await db.serviceOffering.create({ data: { serviceId: s.id, ...clean } });
  await logAudit('SERVICE', s.id, actor.id, `เพิ่มข้อเสนอบริการ “${clean.name}”`);
}

export async function removeOffering(actor: Actor, code: string, offeringId: string) {
  assertCan(actor.role, 'catalogue.manage');
  const s = await serviceByCode(code);
  // ผูกด้วย serviceId ด้วย — ลบข้อเสนอของบริการอื่นผ่านพาธนี้ไม่ได้
  const o = await db.serviceOffering.findFirst({ where: { id: offeringId, serviceId: s.id } });
  if (!o) throw new CatalogueError('ไม่พบข้อเสนอบริการ');
  await db.serviceOffering.delete({ where: { id: o.id } });
  await logAudit('SERVICE', s.id, actor.id, `ลบข้อเสนอบริการ “${o.name}”`);
}

// ── รายการในแคตตาล็อกพอร์ทัล (Request item) ──────────────────

export async function addCatalogItem(actor: Actor, code: string, input: { name: string; items: string; slaText: string; sortOrder: string }) {
  assertCan(actor.role, 'catalogue.manage');
  const s = await serviceByCode(code);
  const { errors, clean } = validateCatalogItem(input);
  if (errors.length) throw new CatalogueError(errors.join(' · '));
  await db.catalogItem.create({ data: { ...clean, serviceId: s.id, published: true } });
  await logAudit('SERVICE', s.id, actor.id, `เพิ่มรายการในแคตตาล็อกพอร์ทัล “${clean.name}”`);
}

async function ownedItem(serviceId: string, itemId: string) {
  const it = await db.catalogItem.findFirst({ where: { id: itemId, serviceId }, include: { _count: { select: { requests: true } } } });
  if (!it) throw new CatalogueError('ไม่พบรายการแคตตาล็อก');
  return it;
}

export async function updateCatalogItem(actor: Actor, code: string, itemId: string, input: { name: string; items: string; slaText: string; sortOrder: string }) {
  assertCan(actor.role, 'catalogue.manage');
  const s = await serviceByCode(code);
  const it = await ownedItem(s.id, itemId);
  const { errors, clean } = validateCatalogItem(input);
  if (errors.length) throw new CatalogueError(errors.join(' · '));
  await db.catalogItem.update({ where: { id: it.id }, data: clean });
  await logAudit('SERVICE', s.id, actor.id, `แก้ไขรายการแคตตาล็อก “${clean.name}”`);
}

/** เผยแพร่/ซ่อนจากพอร์ทัล — คำขอเดิมที่เคยส่งแล้วยังอยู่และเปิดดูได้ตามปกติ */
export async function setCatalogItemPublished(actor: Actor, code: string, itemId: string, published: boolean) {
  assertCan(actor.role, 'catalogue.manage');
  const s = await serviceByCode(code);
  const it = await ownedItem(s.id, itemId);
  if (it.published === published) return;
  await db.catalogItem.update({ where: { id: it.id }, data: { published } });
  await logAudit('SERVICE', s.id, actor.id, `${published ? 'เผยแพร่' : 'ซ่อน'}รายการในพอร์ทัล “${it.name}”`);
}

export async function removeCatalogItem(actor: Actor, code: string, itemId: string) {
  assertCan(actor.role, 'catalogue.manage');
  const s = await serviceByCode(code);
  const it = await ownedItem(s.id, itemId);
  if (it._count.requests > 0) throw new CatalogueError(`ลบไม่ได้ — มีคำขอบริการ ${it._count.requests} รายการอ้างอิงอยู่ ให้ซ่อนจากพอร์ทัลแทน`);
  await db.catalogItem.delete({ where: { id: it.id } });
  await logAudit('SERVICE', s.id, actor.id, `ลบรายการแคตตาล็อก “${it.name}”`);
}
