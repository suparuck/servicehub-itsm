// Problem Management — กฎการเปลี่ยนระยะ (ฟังก์ชันบริสุทธิ์)
export type ProblemPhase = 'IDENTIFICATION' | 'CONTROL' | 'ERROR_CONTROL' | 'KNOWN_ERROR' | 'RESOLVED';

export const PHASES: ProblemPhase[] = ['IDENTIFICATION', 'CONTROL', 'ERROR_CONTROL', 'KNOWN_ERROR', 'RESOLVED'];

// ระบุปัญหา → ควบคุมปัญหา (วิเคราะห์สาเหตุ) → ควบคุมข้อผิดพลาด → Known Error → แก้ไขแล้ว
const NEXT: Record<ProblemPhase, ProblemPhase[]> = {
  IDENTIFICATION: ['CONTROL'],
  CONTROL: ['ERROR_CONTROL'],
  ERROR_CONTROL: ['KNOWN_ERROR', 'RESOLVED'],
  KNOWN_ERROR: ['RESOLVED'],
  RESOLVED: ['CONTROL'], // เปิดใหม่เมื่อปัญหากลับมา
};

export const nextPhases = (from: ProblemPhase) => NEXT[from];

export interface TransitionContext {
  rootCause?: string | null;
  workaround?: string | null;
  /** Change ที่ผูกกับ Problem และยังไม่เสร็จ */
  openChanges: number;
}

/** คืนข้อความผิดพลาด หรือ null ถ้าเปลี่ยนระยะได้ */
export function validateTransition(from: ProblemPhase, to: ProblemPhase, ctx: TransitionContext): string | null {
  if (!NEXT[from].includes(to)) return 'ไม่สามารถเปลี่ยนไประยะนี้ได้จากระยะปัจจุบัน';
  const has = (v?: string | null) => !!v?.trim();
  if (to === 'ERROR_CONTROL' && !has(ctx.rootCause)) return 'ต้องระบุสาเหตุที่แท้จริง (Root cause) ก่อนเข้าสู่ระยะควบคุมข้อผิดพลาด';
  if (to === 'KNOWN_ERROR' && !has(ctx.workaround)) return 'ต้องระบุวิธีแก้ชั่วคราว (Workaround) ก่อนบันทึกเป็น Known Error';
  if (to === 'RESOLVED') {
    if (!has(ctx.rootCause)) return 'ต้องระบุสาเหตุที่แท้จริงก่อนปิด Problem';
    if (ctx.openChanges > 0) return `ยังมี Change ที่ผูกอยู่และยังไม่เสร็จ ${ctx.openChanges} รายการ`;
  }
  return null;
}

export { parseBkkDate as parseTargetDate } from './dateInput';
