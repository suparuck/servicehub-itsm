import { db } from './db';
import type { ChangeRow, ProblemRow } from './calendar';
import type { ChangeStatus, ChangeType } from './change';

/**
 * โหลด Change/Problem ที่อยู่ในช่วง [from, to) — Change ดูจากเวลาเริ่ม, Problem ดูจากวันกำหนดแก้ไข/ทบทวน หรือวันที่แก้ไขแล้ว
 * ขยายช่วงของ Change ให้กว้างกว่าเล็กน้อย เพื่อให้ตรวจ "ชนกัน" กับงานที่คาบเกี่ยวขอบช่วงได้
 */
export async function loadCalendarRows(from: Date, to: Date, show: { change: boolean; problem: boolean } = { change: true, problem: true }): Promise<{ changes: ChangeRow[]; problems: ProblemRow[] }> {
  const pad = 86_400_000;
  const [changes, problems] = await Promise.all([
    show.change
      ? db.change.findMany({ where: { windowStart: { gte: new Date(from.getTime() - pad), lt: new Date(to.getTime() + pad) } }, include: { cis: { select: { ciId: true } } }, orderBy: { windowStart: 'asc' } })
      : Promise.resolve([]),
    show.problem
      ? db.problem.findMany({ where: { OR: [{ targetDate: { gte: from, lt: to } }, { resolvedAt: { gte: from, lt: to } }] }, orderBy: { seq: 'asc' } })
      : Promise.resolve([]),
  ]);
  return {
    // รวมส่วนที่ขยายมาด้วยเพื่อตรวจชน — วันที่อยู่นอกตารางไม่ถูกวาด (byDay ไม่มีช่องวันนั้น) และรายการ agenda กรองเฉพาะเดือนที่เลือก
    changes: changes.map((c) => ({
      id: c.id, seq: c.seq, title: c.title, type: c.type as ChangeType, status: c.status as ChangeStatus, windowStart: c.windowStart, windowEnd: c.windowEnd,
      serviceId: c.serviceId, ciIds: c.cis.map((x) => x.ciId),
    })),
    problems: problems.map((p) => ({ id: p.id, seq: p.seq, title: p.title, phase: p.phase, targetDate: p.targetDate, resolvedAt: p.resolvedAt })),
  };
}

/** ช่วงสำหรับไฟล์ .ics: 30 วันที่ผ่านมา – 6 เดือนข้างหน้า */
export const exportRange = (now = new Date()) => ({ from: new Date(now.getTime() - 30 * 86_400_000), to: new Date(now.getTime() + 183 * 86_400_000) });
