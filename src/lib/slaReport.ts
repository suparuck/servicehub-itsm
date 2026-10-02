import type { Priority, SlaMetric } from '@prisma/client';
import { db } from './db';
import { aggregate, meanMinutes, overall, type GroupStat } from './slaStats';
import { timerView } from './sla';

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];
export const parsePeriod = (v: string | undefined): Period => (PERIODS.find((p) => String(p) === v) ?? 30);

const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];

export interface SlaReport {
  days: number;
  resolve: GroupStat;
  response: GroupStat;
  byService: GroupStat[];
  byPriority: GroupStat[];
  mttrMin: number | null;
  mttrByPriority: { priority: Priority; min: number | null; count: number }[];
  breaches: { incidentId: string; seq: number; title: string; service: string; priority: Priority; metric: SlaMetric; overrunMin: number }[];
  atRisk: { incidentId: string; seq: number; title: string; service: string; priority: Priority; leftMin: number; pct: number; overdue: boolean }[];
}

/** รายงาน SLA จาก timer ที่จบแล้วภายในช่วงที่เลือก + timer ที่กำลังเดินและใกล้ผิด */
export async function getSlaReport(days: number, now = new Date()): Promise<SlaReport> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [done, running, resolved] = await Promise.all([
    db.slaTimer.findMany({ where: { achievedAt: { gte: since, lte: now } }, include: { incident: { include: { service: true } } } }),
    db.slaTimer.findMany({ where: { achievedAt: null, metric: 'RESOLVE', incident: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }, include: { incident: { include: { service: true } } } }),
    db.incident.findMany({ where: { resolvedAt: { gte: since, lte: now } }, select: { createdAt: true, resolvedAt: true, priority: true } }),
  ]);

  const sample = (metric: SlaMetric, group: (t: (typeof done)[number]) => string) =>
    done.filter((t) => t.metric === metric).map((t) => ({ group: group(t), met: t.achievedAt!.getTime() <= t.dueAt.getTime() }));

  const resolveSamples = sample('RESOLVE', (t) => t.incident.service?.name ?? '—');
  const byService = aggregate(resolveSamples).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
  const prioOrder = (g: GroupStat) => PRIORITIES.indexOf(g.group as Priority);
  const byPriority = aggregate(sample('RESOLVE', (t) => t.incident.priority)).sort((a, b) => prioOrder(a) - prioOrder(b));

  const breaches = done
    .filter((t) => t.achievedAt!.getTime() > t.dueAt.getTime())
    .sort((a, b) => b.achievedAt!.getTime() - a.achievedAt!.getTime())
    .slice(0, 10)
    .map((t) => ({
      incidentId: t.incidentId, seq: t.incident.seq, title: t.incident.title, service: t.incident.service?.name ?? '—',
      priority: t.incident.priority, metric: t.metric, overrunMin: Math.round((t.achievedAt!.getTime() - t.dueAt.getTime()) / 60_000),
    }));

  const atRisk = running
    .map((t) => ({ t, v: timerView(t, now) }))
    .filter(({ v }) => v.state === 'BREACHED' || v.near)
    .sort((a, b) => a.v.leftMs - b.v.leftMs)
    .slice(0, 10)
    .map(({ t, v }) => ({
      incidentId: t.incidentId, seq: t.incident.seq, title: t.incident.title, service: t.incident.service?.name ?? '—',
      priority: t.incident.priority, leftMin: Math.round(v.leftMs / 60_000), pct: v.pct, overdue: v.state === 'BREACHED',
    }));

  const pairs = (rows: typeof resolved) => rows.filter((r) => r.resolvedAt).map((r) => ({ start: r.createdAt, end: r.resolvedAt! }));
  return {
    days,
    resolve: overall(resolveSamples),
    response: overall(sample('RESPONSE', () => '*')),
    byService,
    byPriority,
    mttrMin: meanMinutes(pairs(resolved)),
    mttrByPriority: PRIORITIES.map((p) => {
      const rows = resolved.filter((r) => r.priority === p);
      return { priority: p, min: meanMinutes(pairs(rows)), count: rows.length };
    }),
    breaches,
    atRisk,
  };
}
