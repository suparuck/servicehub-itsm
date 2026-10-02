import type { Priority } from '@prisma/client';
import { db } from './db';
import { startOfTodayBangkok } from './datetime';
import { LEVELS, type Level } from './priority';

export type QueueFilter = 'all' | 'mine' | 'near';
const NEAR_SLA_PCT = 25; // เหลือเวลา ≤ 25% ของเป้าหมาย ถือว่าใกล้ผิด SLA
const PRIORITY_ORDER: Record<Priority, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
const OPEN = { notIn: ['RESOLVED', 'CLOSED'] as ('RESOLVED' | 'CLOSED')[] };

type Snap = {
  kpis: Record<'requests' | 'mttr' | 'sla' | 'changeSuccess' | 'csat', { value: string; note: string; good: boolean }>;
  chain: string[];
  slaByService: { name: string; pct: number }[];
};

export async function getDashboard(filter: QueueFilter, userId?: string) {
  const now = Date.now();
  const [open, snapRow, changes, problems, services, improve, ciCount] = await Promise.all([
    db.incident.findMany({
      where: { status: OPEN },
      include: { service: true, group: true, timers: { where: { metric: 'RESOLVE' } } },
    }),
    db.dashboardSnapshot.findUnique({ where: { key: 'dashboard' } }),
    db.change.findMany({
      where: { windowStart: { gte: startOfTodayBangkok() }, status: { notIn: ['CANCELLED', 'COMPLETED', 'FAILED'] } },
      orderBy: { windowStart: 'asc' },
      take: 4,
    }),
    db.problem.findMany({
      where: { phase: { not: 'RESOLVED' } },
      orderBy: { seq: 'desc' },
      take: 3,
      include: { _count: { select: { incidents: true } } },
    }),
    db.service.findMany({ orderBy: { sortOrder: 'asc' }, take: 6 }),
    db.improvementItem.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.configurationItem.count({ where: { lifecycle: { not: 'RETIRED' } } }),
  ]);
  const snap = (snapRow?.data ?? {}) as Partial<Snap>;

  const rows = open
    .map((i) => {
      const t = i.timers[0];
      const leftMin = t ? (t.dueAt.getTime() - now) / 60_000 : null;
      const pct = t && leftMin !== null ? (leftMin / t.targetMinutes) * 100 : null;
      return { ...i, leftMin, pct };
    })
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        (a.leftMin ?? Infinity) - (b.leftMin ?? Infinity) ||
        b.seq - a.seq,
    );

  const isNear = (r: (typeof rows)[number]) => r.pct !== null && r.pct <= NEAR_SLA_PCT;
  const counts = {
    all: rows.length,
    mine: rows.filter((r) => userId && r.assigneeId === userId).length,
    near: rows.filter(isNear).length,
  };
  const queue = rows
    .filter((r) => (filter === 'mine' ? userId && r.assigneeId === userId : filter === 'near' ? isNear(r) : true))
    .slice(0, 6);

  // เมทริกซ์: แถว = Impact, คอลัมน์ = Urgency (HIGH, MED, LOW)
  const matrix = LEVELS.map((impact) =>
    LEVELS.map((urgency) => {
      const n = open.filter((i) => i.impact === impact && i.urgency === urgency).length;
      return { impact, urgency, n };
    }),
  );

  const p1 = open.filter((i) => i.priority === 'P1').length;

  return {
    counts,
    queue,
    matrix: matrix as { impact: Level; urgency: Level; n: number }[][],
    changes,
    problems,
    services,
    improve,
    p1,
    ciCount,
    snap,
  };
}
