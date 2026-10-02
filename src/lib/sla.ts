import type { IncidentStatus } from './incident';

// SLA timer — ปฏิทิน 24x7 (ปฏิทินเวลาทำการมาในเฟส SLA reports)
// หยุดเวลาเมื่อสถานะ PENDING_USER และเดินต่อเมื่อออกจากสถานะนั้น
export type TimerMetric = 'RESPONSE' | 'RESOLVE';
export type TimerState = 'RUNNING' | 'PAUSED' | 'MET' | 'BREACHED';

export interface TimerLike {
  metric: TimerMetric;
  startedAt: Date;
  dueAt: Date;
  targetMinutes: number;
  achievedAt: Date | null;
  pausedAt: Date | null;
  state: TimerState;
}

export const NEAR_BREACH_PCT = 25;
const MIN = 60_000;

export interface TimerView {
  state: TimerState;
  /** เวลาที่เหลือเป็นมิลลิวินาที (ติดลบ = เกินกำหนด) */
  leftMs: number;
  /** เปอร์เซ็นต์เวลาที่เหลือ 0–100 */
  pct: number;
  near: boolean;
}

export function timerView(t: TimerLike, now: Date): TimerView {
  if (t.achievedAt) {
    const met = t.achievedAt.getTime() <= t.dueAt.getTime();
    return { state: met ? 'MET' : 'BREACHED', leftMs: t.dueAt.getTime() - t.achievedAt.getTime(), pct: 100, near: false };
  }
  const ref = t.pausedAt ?? now;
  const leftMs = t.dueAt.getTime() - ref.getTime();
  const pct = Math.max(0, Math.min(100, (leftMs / (t.targetMinutes * MIN)) * 100));
  if (t.pausedAt) return { state: 'PAUSED', leftMs, pct, near: false };
  if (leftMs <= 0) return { state: 'BREACHED', leftMs, pct: 0, near: false };
  return { state: 'RUNNING', leftMs, pct, near: pct <= NEAR_BREACH_PCT };
}

export interface TimerPatch {
  metric: TimerMetric;
  data: Partial<Pick<TimerLike, 'dueAt' | 'achievedAt' | 'pausedAt' | 'state'>>;
}

/** ผลของการเปลี่ยนสถานะต่อ SLA timer (ฟังก์ชันบริสุทธิ์ — ผู้เรียกเป็นคนบันทึกลง DB) */
export function timerEffects(timers: TimerLike[], from: IncidentStatus, to: IncidentStatus, now: Date): TimerPatch[] {
  const out: TimerPatch[] = [];
  for (const t of timers) {
    const data: TimerPatch['data'] = {};
    let dueAt = t.dueAt;

    if (t.metric === 'RESPONSE') {
      if (from === 'NEW' && to !== 'NEW' && !t.achievedAt) {
        data.achievedAt = now;
        data.state = now.getTime() <= dueAt.getTime() ? 'MET' : 'BREACHED';
      }
    } else {
      // กลับมาเดินต่อ: ขยาย dueAt เท่ากับเวลาที่หยุดไป
      if (from === 'PENDING_USER' && t.pausedAt) {
        dueAt = new Date(dueAt.getTime() + (now.getTime() - t.pausedAt.getTime()));
        data.dueAt = dueAt;
        data.pausedAt = null;
        data.state = 'RUNNING';
      }
      if (to === 'PENDING_USER') {
        data.pausedAt = now;
        data.state = 'PAUSED';
      } else if (to === 'RESOLVED' && !t.achievedAt) {
        data.achievedAt = now;
        data.state = now.getTime() <= dueAt.getTime() ? 'MET' : 'BREACHED';
      } else if (from === 'RESOLVED' && to === 'IN_PROGRESS') {
        // เปิดใหม่ (reopen)
        data.achievedAt = null;
        data.state = 'RUNNING';
      }
    }
    if (Object.keys(data).length) out.push({ metric: t.metric, data });
  }
  return out;
}

/** เปลี่ยนเป้าหมายเมื่อ priority เปลี่ยน โดยคงส่วนที่ถูกขยายจากการหยุดเวลาไว้ */
export function retarget(t: Pick<TimerLike, 'startedAt' | 'dueAt' | 'targetMinutes'>, newMinutes: number) {
  const shift = t.dueAt.getTime() - (t.startedAt.getTime() + t.targetMinutes * MIN);
  return { targetMinutes: newMinutes, dueAt: new Date(t.startedAt.getTime() + newMinutes * MIN + shift) };
}

/** 0:42:18 — ใช้ทั้งฝั่งเซิร์ฟเวอร์และตัวนับเวลาฝั่งไคลเอนต์ */
export function formatHms(ms: number): string {
  const abs = Math.abs(Math.floor(ms / 1000));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const body = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return ms < 0 ? `-${body}` : body;
}

export function formatTargetMinutes(min: number): string {
  if (min % (24 * 60) === 0) return `${min / (24 * 60)} วัน`;
  if (min >= 120 && min % 60 === 0) return `${min / 60} ชั่วโมง`;
  if (min >= 60) return `${Math.floor(min / 60)} ชั่วโมง ${min % 60} นาที`;
  return `${min} นาที`;
}
