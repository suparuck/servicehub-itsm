import type { IncidentStatus, Prisma } from '@prisma/client';
import { db } from './db';
import { incidentBars, parsePortalDocNo, searchTokens, type DocKind } from './portal';
import { th } from '@/i18n/th';
import { formatDocNo } from './docno';

const DEMO_EMAIL = process.env.DEMO_PORTAL_USER_EMAIL ?? 'employee@servicehub.local';
const DONE_REQ = ['DELIVERED', 'REJECTED', 'CANCELLED'] as const;

export class PortalError extends Error {}

// ยังไม่มี Auth — ใช้ผู้ใช้ปลายทางตัวอย่างจาก seed
export async function getPortalUser() {
  return db.user.findUnique({ where: { email: DEMO_EMAIL } });
}

export async function getOutage() {
  const svc = await db.service.findFirst({ where: { health: { in: ['DOWN', 'DEGRADED'] } }, orderBy: [{ health: 'desc' }, { sortOrder: 'asc' }] });
  if (!svc) return null;
  // ข้อความล่าสุดที่ผู้ใช้มองเห็นได้จาก Incident ที่ยังเปิดของบริการนั้น
  const note = await db.workNote.findFirst({
    where: { visibility: 'CUSTOMER', incident: { serviceId: svc.id, status: { notIn: ['RESOLVED', 'CLOSED'] } } },
    orderBy: { createdAt: 'desc' },
  });
  return { service: svc, text: svc.health === 'DOWN' ? th.portal.outageDown(svc.name) : th.portal.outageDegraded(svc.name), update: note?.body ?? null };
}

export interface MineItem {
  key: string;
  docNo: string;
  kind: DocKind;
  title: string;
  state: string;
  bars: number;
  next: string;
  done: boolean;
  createdAt: Date;
  steps: readonly string[];
}

const lastCustomerNote = (notes: { visibility: string; body: string; kind?: string }[]) => notes[0]?.body;

export async function getMine(userId: string, opts: { onlyActive?: boolean; take?: number } = {}): Promise<MineItem[]> {
  const [reqs, incs] = await Promise.all([
    db.serviceRequest.findMany({ where: { requesterId: userId, ...(opts.onlyActive ? { status: { notIn: [...DONE_REQ] } } : {}) }, orderBy: { createdAt: 'desc' }, take: opts.take }),
    db.incident.findMany({
      where: { reporterId: userId, ...(opts.onlyActive ? { status: { not: 'CLOSED' } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: opts.take,
      include: { notes: { where: { visibility: 'CUSTOMER' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
  ]);
  const items: MineItem[] = [
    ...reqs.map((r): MineItem => ({
      key: r.id, docNo: formatDocNo('REQ', r.seq), kind: 'REQ', title: r.title, state: th.portal.requestState[r.status],
      bars: r.stage, next: r.nextNote ?? th.portal.requestForm.flow, done: (DONE_REQ as readonly string[]).includes(r.status),
      createdAt: r.createdAt, steps: th.portal.requestSteps,
    })),
    ...incs.map((i): MineItem => ({
      key: i.id, docNo: formatDocNo('INC', i.seq), kind: 'INC', title: i.title, state: th.portal.incidentState[i.status],
      bars: incidentBars(i.status as IncidentStatus),
      next: lastCustomerNote(i.notes) ?? (i.status === 'RESOLVED' || i.status === 'CLOSED' ? th.portal.nextIncidentDone : th.portal.nextIncident),
      done: i.status === 'CLOSED', createdAt: i.createdAt, steps: th.portal.incidentSteps,
    })),
  ];
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return opts.take ? items.slice(0, opts.take) : items;
}

/** รายการล่าสุดที่เสร็จแล้วและยังไม่ได้ประเมิน (ให้คะแนน CSAT) */
export async function getSurveyCandidate(userId: string) {
  const [req, inc] = await Promise.all([
    db.serviceRequest.findFirst({ where: { requesterId: userId, status: 'DELIVERED', survey: null }, orderBy: { deliveredAt: 'desc' } }),
    db.incident.findFirst({ where: { reporterId: userId, status: 'CLOSED', survey: null }, orderBy: { closedAt: 'desc' } }),
  ]);
  const cands = [
    req && { kind: 'REQ' as const, docNo: formatDocNo('REQ', req.seq), title: req.title, at: req.deliveredAt ?? req.createdAt },
    inc && { kind: 'INC' as const, docNo: formatDocNo('INC', inc.seq), title: inc.title, at: inc.closedAt ?? inc.createdAt },
  ].filter((x): x is NonNullable<typeof x> => !!x);
  return cands.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
}

export async function searchPortal(q: string) {
  const tokens = searchTokens(q);
  if (!tokens.length) return { catalog: [], articles: [] };
  const like = (field: string) => tokens.map((t) => ({ [field]: { contains: t, mode: 'insensitive' as const } }));
  const [catalog, articles] = await Promise.all([
    db.catalogItem.findMany({ where: { OR: [...like('name'), ...like('items')] }, orderBy: { sortOrder: 'asc' } }),
    db.knowledgeArticle.findMany({ where: { status: 'PUBLISHED', OR: [...like('title'), ...like('body')] }, orderBy: { views: 'desc' }, take: 20 }),
  ]);
  return { catalog, articles };
}

/** ดึงรายการของผู้ใช้ตามเลขที่เอกสาร (คืน null ถ้าไม่ใช่ของผู้ใช้) */
export async function getOwnedItem(userId: string, docNo: string) {
  const p = parsePortalDocNo(docNo);
  if (!p) return null;
  if (p.kind === 'REQ') {
    const r = await db.serviceRequest.findFirst({
      where: { seq: p.seq, requesterId: userId },
      include: { catalog: true, approvals: true, tasks: true, survey: true },
    });
    return r ? ({ kind: 'REQ', req: r } as const) : null;
  }
  const i = await db.incident.findFirst({
    where: { seq: p.seq, reporterId: userId },
    include: { service: true, survey: true, notes: { where: { visibility: 'CUSTOMER' }, orderBy: { createdAt: 'desc' }, include: { author: true } } },
  });
  return i ? ({ kind: 'INC', inc: i } as const) : null;
}

export async function submitRequest(userId: string, input: { catalogId: string; title: string; description: string }) {
  const title = input.title.trim();
  if (!title) throw new PortalError('กรุณาระบุสิ่งที่ต้องการ');
  if (title.length > 200) throw new PortalError('หัวข้อยาวเกิน 200 ตัวอักษร');
  const item = await db.catalogItem.findUnique({ where: { id: input.catalogId } });
  if (!item) throw new PortalError('กรุณาเลือกประเภทบริการ');
  const data: Prisma.ServiceRequestCreateInput = {
    title, description: input.description.trim() || null, status: 'PENDING_APPROVAL', stage: 1,
    nextNote: 'ส่ง → อนุมัติ → จัดเตรียม → ส่งมอบ · รอหัวหน้างานอนุมัติ',
    catalog: { connect: { id: item.id } }, requester: { connect: { id: userId } },
    approvals: { create: { approver: 'หัวหน้างานโดยตรง' } },
  };
  return db.serviceRequest.create({ data });
}

export async function submitSurvey(userId: string, docNo: string, score: number, comment: string) {
  const p = parsePortalDocNo(docNo);
  if (!p) throw new PortalError('ไม่พบรายการ');
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new PortalError('คะแนนต้องอยู่ระหว่าง 1 ถึง 5');
  const owned = await getOwnedItem(userId, docNo);
  if (!owned) throw new PortalError('ไม่พบรายการ');
  if (owned.kind === 'REQ') {
    if (owned.req.status !== 'DELIVERED') throw new PortalError('ประเมินได้หลังส่งมอบแล้วเท่านั้น');
    if (owned.req.survey) throw new PortalError('รายการนี้ประเมินแล้ว');
    await db.surveyResponse.create({ data: { requestId: owned.req.id, userId, score, comment: comment.trim() || null } });
  } else {
    if (owned.inc.status !== 'CLOSED') throw new PortalError('ประเมินได้หลังปิดเรื่องแล้วเท่านั้น');
    if (owned.inc.survey) throw new PortalError('รายการนี้ประเมินแล้ว');
    await db.surveyResponse.create({ data: { incidentId: owned.inc.id, userId, score, comment: comment.trim() || null } });
  }
}

export async function getKnowledge(q?: string) {
  const tokens = q ? searchTokens(q) : [];
  return db.knowledgeArticle.findMany({
    where: {
      status: 'PUBLISHED',
      ...(tokens.length ? { OR: tokens.flatMap((t) => [{ title: { contains: t, mode: 'insensitive' as const } }, { body: { contains: t, mode: 'insensitive' as const } }]) } : {}),
    },
    orderBy: { views: 'desc' },
  });
}
