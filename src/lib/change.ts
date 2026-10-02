// Change Enablement — กฎของวงจรชีวิต การอนุมัติ และปฏิทิน (ฟังก์ชันบริสุทธิ์)
export type ChangeType = 'STANDARD' | 'NORMAL' | 'EMERGENCY';
export type ChangeStatus = 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'SCHEDULED' | 'IMPLEMENTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type Decision = 'PENDING' | 'APPROVED' | 'REJECTED';

export const STATUS_FLOW: ChangeStatus[] = ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'SCHEDULED', 'IMPLEMENTING', 'COMPLETED'];
export const CLOSED_STATUSES: ChangeStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];
export const isClosed = (s: ChangeStatus) => CLOSED_STATUSES.includes(s);

const NEXT: Record<ChangeStatus, ChangeStatus[]> = {
  DRAFT: ['AWAITING_APPROVAL', 'APPROVED', 'CANCELLED'], // APPROVED ตรง ๆ เฉพาะ Standard (อนุมัติล่วงหน้า)
  AWAITING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['IMPLEMENTING', 'CANCELLED'],
  IMPLEMENTING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};
export const canMove = (from: ChangeStatus, to: ChangeStatus) => NEXT[from].includes(to);

/** คณะที่พิจารณา: Emergency → ECAB, อื่น ๆ → CAB (Standard ไม่ต้องผ่านคณะ) */
export const boardFor = (type: ChangeType): 'CAB' | 'ECAB' | null => (type === 'STANDARD' ? null : type === 'EMERGENCY' ? 'ECAB' : 'CAB');

/**
 * ผลการอนุมัติ: มีผู้ไม่อนุมัติแม้คนเดียว → REJECTED
 * Normal ต้องอนุมัติครบทุกคน · Emergency (ECAB) อนุมัติ ≥ 1 คนก็พอ เพื่อความเร็ว
 */
export function evaluateApprovals(type: ChangeType, decisions: Decision[]): 'APPROVED' | 'REJECTED' | 'PENDING' {
  if (decisions.length === 0) return 'PENDING';
  if (decisions.includes('REJECTED')) return 'REJECTED';
  const approved = decisions.filter((d) => d === 'APPROVED').length;
  if (type === 'EMERGENCY') return approved >= 1 ? 'APPROVED' : 'PENDING';
  return approved === decisions.length ? 'APPROVED' : 'PENDING';
}

export interface SubmitInput {
  title: string;
  type: ChangeType;
  windowStart: Date;
  windowEnd: Date | null;
  implementationPlan?: string | null;
  backoutPlan?: string | null;
}

/** ตรวจความพร้อมก่อนส่งอนุมัติ — คืนรายการข้อผิดพลาดทั้งหมด (ว่าง = ผ่าน) */
export function validateSubmit(c: SubmitInput, now = new Date()): string[] {
  const errs: string[] = [];
  if (!c.title.trim()) errs.push('ต้องระบุหัวข้อ');
  if (c.windowEnd && c.windowEnd.getTime() <= c.windowStart.getTime()) errs.push('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
  if (c.type !== 'STANDARD') {
    if (!c.implementationPlan?.trim()) errs.push('ต้องระบุแผนการดำเนินการ (Implementation plan)');
    if (!c.backoutPlan?.trim()) errs.push('ต้องระบุแผนถอยกลับ (Back-out plan)');
  }
  if (c.type === 'NORMAL' && c.windowStart.getTime() < now.getTime()) errs.push('Normal Change ต้องกำหนดช่วงเวลาในอนาคต');
  return errs;
}

export interface Windowed {
  id: string;
  windowStart: Date;
  windowEnd: Date | null;
  serviceId?: string | null;
  ciIds: string[];
  status?: ChangeStatus;
}
const end = (c: Windowed) => (c.windowEnd ?? new Date(c.windowStart.getTime() + 3_600_000)).getTime();

/** Change อื่นที่ทับช่วงเวลาและแตะ CI/บริการเดียวกัน (ไม่นับที่ปิดแล้ว) */
export function findConflicts<T extends Windowed>(target: Windowed, others: T[]): { change: T; reason: 'CI' | 'SERVICE' }[] {
  const out: { change: T; reason: 'CI' | 'SERVICE' }[] = [];
  for (const o of others) {
    if (o.id === target.id || (o.status && isClosed(o.status))) continue;
    const overlap = target.windowStart.getTime() < end(o) && o.windowStart.getTime() < end(target);
    if (!overlap) continue;
    if (o.ciIds.some((c) => target.ciIds.includes(c))) out.push({ change: o, reason: 'CI' });
    else if (target.serviceId && o.serviceId === target.serviceId) out.push({ change: o, reason: 'SERVICE' });
  }
  return out;
}

// ── ปฏิทิน (วันที่ตามเวลาไทย) ─────────────────────────────────────
const BKK_OFFSET = 7 * 3_600_000;
/** YYYY-MM-DD ตามเวลาไทย */
export const bangkokYmd = (d: Date) => new Date(d.getTime() + BKK_OFFSET).toISOString().slice(0, 10);

export interface DayCell {
  ymd: string;
  day: number;
  inMonth: boolean;
}

/** ตารางเดือนเริ่มวันอาทิตย์ — month เริ่มที่ 1–12 */
export function buildMonthGrid(year: number, month: number): DayCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(first.getTime() - first.getUTCDay() * 86_400_000);
  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start.getTime() + (w * 7 + d) * 86_400_000);
      row.push({ ymd: cur.toISOString().slice(0, 10), day: cur.getUTCDate(), inMonth: cur.getUTCMonth() === month - 1 });
    }
    if (w >= 4 && !row.some((c) => c.inMonth)) break; // ตัดสัปดาห์ท้ายที่ไม่มีวันของเดือนนี้
    weeks.push(row);
  }
  return weeks;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function parseMonthParam(v: string | undefined, now = new Date()): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? '');
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) };
  const [y, mo] = bangkokYmd(now).split('-').map(Number);
  return { year: y, month: mo };
}
