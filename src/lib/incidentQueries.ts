import type { Prisma } from '@prisma/client';
import { db } from './db';
import { parseDocNo } from './docno';
import { OPEN_STATUSES, ALL_STATUSES, type IncidentStatus } from './incident';

export const PAGE_SIZE = 20;

export async function getFormOptions() {
  const [services, groups, users, cis] = await Promise.all([
    db.service.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    db.assignmentGroup.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.user.findMany({ where: { role: { in: ['AGENT', 'RESOLVER_GROUP_LEAD'] } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.configurationItem.findMany({
      where: { lifecycle: { not: 'RETIRED' } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, classLabel: true },
    }),
  ]);
  return { services, groups, users, cis: cis.map((c) => ({ id: c.id, name: c.name, sub: c.classLabel ?? undefined })) };
}

export interface ListQuery {
  q?: string;
  status?: string; // 'open' | 'all' | IncidentStatus
  priority?: string;
  group?: string;
  page?: number;
}

export async function listIncidents(query: ListQuery) {
  const where: Prisma.IncidentWhereInput = {};
  const status = query.status ?? 'open';
  if (status === 'open') where.status = { in: OPEN_STATUSES };
  else if (ALL_STATUSES.includes(status as IncidentStatus)) where.status = status as IncidentStatus;
  if (['P1', 'P2', 'P3', 'P4'].includes(query.priority ?? '')) where.priority = query.priority as 'P1';
  if (query.group) where.groupId = query.group;

  const q = query.q?.trim();
  if (q) {
    const seq = parseDocNo('INC', q) ?? (/^\d+$/.test(q) ? Number(q) : null);
    where.OR = [{ title: { contains: q, mode: 'insensitive' } }, ...(seq !== null ? [{ seq }] : [])];
  }

  const page = Math.max(1, query.page ?? 1);
  const [total, rows] = await Promise.all([
    db.incident.count({ where }),
    db.incident.findMany({
      where,
      include: { service: true, group: true, assignee: true, timers: { where: { metric: 'RESOLVE' } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getIncidentByDocNo(docNo: string) {
  const seq = parseDocNo('INC', decodeURIComponent(docNo));
  if (seq === null) return null;
  return db.incident.findUnique({
    where: { seq },
    include: {
      service: true,
      group: true,
      assignee: true,
      manager: true,
      parent: true,
      children: { select: { id: true, seq: true, title: true } },
      problem: true,
      change: true,
      timers: true,
      notes: { orderBy: { createdAt: 'desc' }, include: { author: true } },
      cis: { include: { ci: true } },
    },
  });
}
