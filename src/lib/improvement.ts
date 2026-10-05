// Continual Improvement — โมเดลปรับปรุง 7 ขั้นของ ITIL 4 (ฟังก์ชันบริสุทธิ์ ทดสอบได้โดยไม่ใช้ DB)
import { bangkokYmd } from './change';
import { parseBkkDate } from './dateInput';

export type ImpStatus = 'OPEN' | 'ON_HOLD' | 'DONE' | 'CANCELLED';
export const STEP_COUNT = 7;
export const isStep = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= STEP_COUNT;

/** ข้อมูลที่ต้องมีก่อนเดินหน้า — ขั้น 1–3 คือการกำหนดวิสัยทัศน์ สถานะปัจจุบัน และเป้าหมายที่ "วัดได้" */
export interface StepContext {
  description: string | null;
  baseline: string | null;
  goal: string | null;
  result: string | null;
}
const has = (v: string | null | undefined) => !!v?.trim();

/**
 * ย้ายขั้นได้ทีละ 1 (ไปข้างหน้า) หรือย้อนกลับได้ทุกขั้น (ทำซ้ำเมื่อผลยังไม่ถึงเป้า)
 * ประตูตรวจ: ออกจากขั้น 1 ต้องมีวิสัยทัศน์ · ออกจากขั้น 2 ต้องมีค่าฐาน · ออกจากขั้น 3 ต้องมีเป้าหมาย · ออกจากขั้น 6 ต้องมีผลที่ได้
 * คืนข้อความผิดพลาด หรือ null เมื่อย้ายได้
 */
export function validateStepMove(from: number, to: number, ctx: StepContext): string | null {
  if (!isStep(from) || !isStep(to)) return 'ขั้นไม่ถูกต้อง';
  if (to === from) return 'อยู่ขั้นนี้อยู่แล้ว';
  if (to < from) return null;
  if (to > from + 1) return 'ข้ามขั้นไม่ได้ — ต้องทำทีละขั้นตามโมเดล';
  if (from === 1 && !has(ctx.description)) return 'ขั้นที่ 1: ต้องระบุวิสัยทัศน์/เหตุผลก่อนไปขั้นถัดไป';
  if (from === 2 && !has(ctx.baseline)) return 'ขั้นที่ 2: ต้องระบุสถานะปัจจุบันที่วัดได้ (ค่าฐาน) ก่อนไปขั้นถัดไป';
  if (from === 3 && !has(ctx.goal)) return 'ขั้นที่ 3: ต้องระบุเป้าหมายที่วัดได้ก่อนไปขั้นถัดไป';
  if (from === 6 && !has(ctx.result)) return 'ขั้นที่ 6: ต้องบันทึกผลที่ได้จริงก่อนไปขั้นถัดไป';
  return null;
}

/** ปิดรายการว่า "บรรลุแล้ว": ต้องอยู่ขั้น 6 ขึ้นไป และมีผลที่ได้จริง (ไม่ปิดโดยไม่ตรวจผล) */
export function validateComplete(step: number, status: ImpStatus, ctx: StepContext): string | null {
  if (status !== 'OPEN') return 'ปิดได้เฉพาะรายการที่กำลังดำเนินการ';
  if (step < 6) return 'ต้องดำเนินการถึงขั้นที่ 6 (ไปถึงหรือยัง) ก่อนจึงปิดได้';
  if (!has(ctx.result)) return 'ต้องบันทึกผลที่ได้จริงก่อนปิด';
  return null;
}

// ── สถานะ ──
const STATUS_NEXT: Record<ImpStatus, ImpStatus[]> = {
  OPEN: ['ON_HOLD', 'DONE', 'CANCELLED'],
  ON_HOLD: ['OPEN', 'CANCELLED'],
  DONE: ['OPEN'], // เปิดใหม่เมื่อผลไม่คงอยู่
  CANCELLED: [],
};
export const nextImpStatuses = (s: ImpStatus) => STATUS_NEXT[s];
export const canMoveImpStatus = (from: ImpStatus, to: ImpStatus) => STATUS_NEXT[from].includes(to);
/** พัก/ยกเลิกต้องระบุเหตุผล (ติดตามย้อนหลังได้ว่าทำไมไม่ไปต่อ) */
export const needsReason = (to: ImpStatus) => to === 'ON_HOLD' || to === 'CANCELLED';

/** เลยกำหนด: ยังเปิดอยู่และวันเป้าหมาย (เวลาไทย) ผ่านมาแล้ว — วันครบกำหนดวันนี้ยังไม่เลย */
export function isOverdue(i: { status: ImpStatus; targetDate: Date | null }, now = new Date()): boolean {
  return i.status === 'OPEN' && !!i.targetDate && bangkokYmd(i.targetDate) < bangkokYmd(now);
}

/** จำนวนวัน (ตามปฏิทินไทย) ที่เลยวันเป้าหมายมาแล้ว — 0 หรือติดลบ = ยังไม่เลย (วันครบกำหนดวันนี้ = 0) */
export function daysOverdue(target: Date, now = new Date()): number {
  const day = (d: Date) => Math.floor((d.getTime() + 7 * 3_600_000) / 86_400_000);
  return day(now) - day(target);
}

// ── ตรวจข้อมูลฟอร์ม ──
export interface ImpFormInput {
  title: string;
  description: string;
  baseline: string;
  goal: string;
  result: string;
  benefit: string;
  ownerId: string;
  targetDate: string;
  problemId: string;
  serviceId: string;
}

export interface ImpClean {
  title: string;
  description: string | null;
  baseline: string | null;
  goal: string | null;
  result: string | null;
  benefit: 'HIGH' | 'MED' | 'LOW';
  ownerId: string | null;
  targetDate: Date | null;
  problemId: string | null;
  serviceId: string | null;
}

export function validateImprovement(i: ImpFormInput): { errors: string[]; clean: ImpClean } {
  const errors: string[] = [];
  const title = i.title.trim();
  if (!title) errors.push('กรุณาระบุหัวข้อ');
  if (title.length > 200) errors.push('หัวข้อยาวเกิน 200 ตัวอักษร');
  const long = (v: string, label: string) => {
    const t = v.trim();
    if (t.length > 2000) errors.push(`${label}ยาวเกิน 2,000 ตัวอักษร`);
    return t || null;
  };
  const benefit = (['HIGH', 'MED', 'LOW'] as const).find((b) => b === i.benefit);
  if (!benefit) errors.push('ระดับประโยชน์ไม่ถูกต้อง');
  const td = parseBkkDate(i.targetDate);
  if ('error' in td) errors.push(`วันเป้าหมาย: ${td.error}`);
  return {
    errors,
    clean: {
      title,
      description: long(i.description, 'วิสัยทัศน์/เหตุผล'),
      baseline: long(i.baseline, 'สถานะปัจจุบัน'),
      goal: long(i.goal, 'เป้าหมาย'),
      result: long(i.result, 'ผลที่ได้'),
      benefit: benefit ?? 'MED',
      ownerId: i.ownerId.trim() || null,
      targetDate: 'error' in td ? null : td.date,
      problemId: i.problemId.trim() || null,
      serviceId: i.serviceId.trim() || null,
    },
  };
}
