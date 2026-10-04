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

/** 'YYYY-MM-DD' จากช่องวันที่ → 00:00 เวลาไทย · ว่าง → ล้างค่า (date: null) · รูปแบบผิด/วันที่ไม่มีจริง (เช่น 2026-02-30) → error */
export function parseTargetDate(v: string): { date: Date | null } | { error: string } {
  const s = v.trim();
  if (!s) return { date: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: 'รูปแบบวันที่ไม่ถูกต้อง' };
  const d = new Date(`${s}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime()) || new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10) !== s) return { error: 'วันที่ไม่ถูกต้อง' };
  return { date: d };
}
