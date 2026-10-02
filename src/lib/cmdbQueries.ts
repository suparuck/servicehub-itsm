import type { CiClass, CiLifecycle, Prisma } from '@prisma/client';
import { db } from './db';
import { dependencies, dependents, tierOf, type Rel } from './cmdbGraph';

export const PAGE_SIZE = 20;
const DAY = 86_400_000;
export const STALE_DAYS = 90;

export type DqKey = 'noOwner' | 'stale' | 'drift' | 'noModel';
export const DQ_KEYS: DqKey[] = ['noOwner', 'stale', 'drift', 'noModel'];

/** เงื่อนไข Prisma ของงานคุณภาพข้อมูลแต่ละประเภท */
export function dqWhere(key: DqKey, now = new Date()): Prisma.ConfigurationItemWhereInput {
  const cutoff = new Date(now.getTime() - STALE_DAYS * DAY);
  switch (key) {
    case 'noOwner':
      return { lifecycle: { not: 'RETIRED' }, ownerGroupId: null, ownerUserId: null, OR: [{ ownerLabel: null }, { ownerLabel: '' }] };
    case 'stale':
      // CI ที่ถูกค้นพบได้ (ไม่ใช่ Business Service/ไลเซนส์) แต่ไม่พบใน Discovery และไม่ได้ยืนยันเกิน 90 วัน
      return {
        lifecycle: { not: 'PLANNED' },
        ciClass: { notIn: ['BUSINESS_SERVICE', 'SOFTWARE_LICENSE'] },
        lastDiscoveredAt: { lt: cutoff },
        OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: cutoff } }],
      };
    case 'drift':
      return { driftNote: { not: null } };
    case 'noModel':
      return { ciClass: 'BUSINESS_SERVICE', lifecycle: { not: 'RETIRED' }, outgoing: { none: {} } };
  }
}

export interface CiListQuery {
  q?: string;
  cls?: string;
  env?: string[]; // ว่าง = ทุกสภาพแวดล้อม
  lifecycle?: CiLifecycle[];
  dq?: string;
  page?: number;
}

export async function listCis(query: CiListQuery) {
  const and: Prisma.ConfigurationItemWhereInput[] = [];
  if (query.cls) and.push({ ciClass: query.cls as CiClass });
  if (query.env?.length) and.push({ environment: { in: query.env } });
  if (query.lifecycle?.length) and.push({ lifecycle: { in: query.lifecycle } });
  if (query.dq && DQ_KEYS.includes(query.dq as DqKey)) and.push(dqWhere(query.dq as DqKey));
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { ciId: { contains: q, mode: 'insensitive' } },
        { subtitle: { contains: q, mode: 'insensitive' } },
        { ownerLabel: { contains: q, mode: 'insensitive' } },
        { ownerGroup: { name: { contains: q, mode: 'insensitive' } } },
        { ownerUser: { name: { contains: q, mode: 'insensitive' } } },
        // ค้นหาในคุณลักษณะ (IP, Serial ฯลฯ) จาก JSON ที่แปลงเป็นข้อความ
        { id: { in: await attributeMatches(q) } },
      ],
    });
  }
  const where: Prisma.ConfigurationItemWhereInput = and.length ? { AND: and } : {};
  const page = Math.max(1, query.page ?? 1);

  const [total, rows] = await Promise.all([
    db.configurationItem.count({ where }),
    db.configurationItem.findMany({
      where,
      orderBy: [{ ciClass: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        ownerGroup: true,
        ownerUser: true,
        incidents: { include: { incident: { select: { seq: true, priority: true, status: true } } } },
        changes: { include: { change: { select: { seq: true, title: true, status: true, windowStart: true } } } },
      },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

async function attributeMatches(q: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "ConfigurationItem" WHERE attributes::text ILIKE ${'%' + q + '%'}`;
  return rows.map((r) => r.id);
}

export async function getCmdbSummary(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_DAYS * DAY);
  const [total, active, rels, byClass, noOwner, stale, drift, noModel, bsTotal, notFresh] = await Promise.all([
    db.configurationItem.count(),
    db.configurationItem.count({ where: { lifecycle: { in: ['LIVE', 'MAINTENANCE'] } } }),
    db.cIRelationship.count(),
    db.configurationItem.groupBy({ by: ['ciClass'], _count: { _all: true } }),
    db.configurationItem.count({ where: dqWhere('noOwner', now) }),
    db.configurationItem.count({ where: dqWhere('stale', now) }),
    db.configurationItem.count({ where: dqWhere('drift', now) }),
    db.configurationItem.count({ where: dqWhere('noModel', now) }),
    db.configurationItem.count({ where: { ciClass: 'BUSINESS_SERVICE', lifecycle: { not: 'RETIRED' } } }),
    // ความถูกต้อง: สัดส่วน CI ที่ใช้งานอยู่ซึ่งตรวจพบ/ยืนยันภายใน 90 วัน (ไม่นับ Business Service ที่ไม่มี Discovery)
    db.configurationItem.count({
      where: {
        lifecycle: { in: ['LIVE', 'MAINTENANCE'] },
        ciClass: { not: 'BUSINESS_SERVICE' },
        OR: [{ lastDiscoveredAt: { gte: cutoff } }, { lastVerifiedAt: { gte: cutoff } }],
      },
    }),
  ]);
  const discoverable = await db.configurationItem.count({ where: { lifecycle: { in: ['LIVE', 'MAINTENANCE'] }, ciClass: { not: 'BUSINESS_SERVICE' } } });
  return {
    total, active, rels,
    classCounts: Object.fromEntries(byClass.map((c) => [c.ciClass, c._count._all])) as Partial<Record<CiClass, number>>,
    dq: { noOwner, stale, drift, noModel } as Record<DqKey, number>,
    accuracyPct: discoverable ? (notFresh / discoverable) * 100 : 100,
    coverage: { modelled: bsTotal - noModel, total: bsTotal },
  };
}

/** รายละเอียด CI + กราฟ Service Model + Impact Analysis */
export async function getCiDetail(ciId: string) {
  const ci = await db.configurationItem.findUnique({
    where: { ciId },
    include: {
      ownerGroup: true,
      ownerUser: true,
      asset: true,
      history: { orderBy: { at: 'desc' }, take: 10 },
      incidents: { include: { incident: { include: { problem: true } } } },
      changes: { include: { change: true } },
      outgoing: { include: { target: true } },
      incoming: { include: { source: true } },
    },
  });
  if (!ci) return null;

  const [allRels, allCis] = await Promise.all([
    db.cIRelationship.findMany({ select: { sourceId: true, targetId: true, type: true } }),
    db.configurationItem.findMany({ select: { id: true, ciId: true, name: true, subtitle: true, ciClass: true, classLabel: true, attributes: true } }),
  ]);
  const rels = allRels as Rel[];
  const byId = new Map(allCis.map((c) => [c.id, c]));
  const up = dependents(ci.id, rels); // ได้รับผลกระทบ
  const down = dependencies(ci.id, rels);

  // Service Model: CI ที่เลือก + ผู้ที่ขึ้นอยู่กับ + สิ่งที่พึ่งพา + (พี่น้อง) สิ่งที่ผู้ขึ้นอยู่กับโดยตรงพึ่งพาด้วย
  const ids = new Set<string>([ci.id, ...up, ...down]);
  for (const r of rels) {
    const dependent = r.type === 'HOSTS' ? r.targetId : r.sourceId;
    const dependency = r.type === 'HOSTS' ? r.sourceId : r.targetId;
    if (up.has(dependent)) ids.add(dependency);
  }
  const tiers: { label: number; nodes: { id: string; ciId: string; name: string; sub: string; kind: 'sel' | 'hit' | 'plain' }[] }[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) continue;
    const tier = tierOf(c.ciClass);
    let t = tiers.find((x) => x.label === tier);
    if (!t) tiers.push((t = { label: tier, nodes: [] }));
    t.nodes.push({ id: c.id, ciId: c.ciId, name: c.name, sub: c.subtitle ?? c.classLabel ?? '', kind: id === ci.id ? 'sel' : up.has(id) ? 'hit' : 'plain' });
  }
  tiers.sort((a, b) => a.label - b.label);
  tiers.forEach((t) => t.nodes.sort((a, b) => a.name.localeCompare(b.name)));

  const impacted = [...up].map((id) => byId.get(id)!).filter(Boolean);
  const bs = impacted.filter((c) => c.ciClass === 'BUSINESS_SERVICE');
  const attr = (c: { attributes: unknown }, k: string) => (c.attributes as Record<string, unknown> | null)?.[k];
  const impact = {
    businessServices: bs.length,
    applications: impacted.filter((c) => c.ciClass === 'APPLICATION').length,
    others: impacted.filter((c) => !['BUSINESS_SERVICE', 'APPLICATION'].includes(c.ciClass)).length,
    users: bs.reduce((n, c) => n + (Number(attr(c, 'userCount')) || 0), 0),
    sla: bs.map((c) => `${c.name} ${attr(c, 'slaTarget') ?? '—'}`),
  };

  // รายการที่เชื่อม: Incident ที่ยังเปิด, Problem ของ Incident นั้น, Change ที่ยังไม่เสร็จ, KB ของ Problem
  const openInc = ci.incidents.map((x) => x.incident).filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status));
  const problemIds = [...new Set(openInc.map((i) => i.problemId).filter((x): x is string => !!x))];
  const kb = problemIds.length ? await db.knowledgeArticle.findMany({ where: { problemId: { in: problemIds } } }) : [];
  const problems = openInc.map((i) => i.problem).filter((p, i, a): p is NonNullable<typeof p> => !!p && a.findIndex((x) => x?.id === p.id) === i);
  const pendingChanges = ci.changes.map((x) => x.change).filter((c) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(c.status));

  return { ci, tiers, impact, openInc, problems, pendingChanges, kb, hasModel: ids.size > 1 };
}

export async function getOwnerOptions() {
  const [groups, users, cis] = await Promise.all([
    db.assignmentGroup.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.user.findMany({ where: { role: { in: ['AGENT', 'RESOLVER_GROUP_LEAD', 'CONFIG_MANAGER'] } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.configurationItem.findMany({ orderBy: { name: 'asc' }, select: { id: true, ciId: true, name: true, classLabel: true } }),
  ]);
  return { groups, users, cis };
}
