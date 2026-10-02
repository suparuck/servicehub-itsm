import { describe, expect, it } from 'vitest';
import { allowedTransitions, canTransition, lifecycleStep } from '@/lib/incident';
import { formatHms, formatTargetMinutes, retarget, timerEffects, timerView, type TimerLike } from '@/lib/sla';

const t0 = new Date('2026-10-02T08:00:00Z');
const min = (n: number) => new Date(t0.getTime() + n * 60_000);

const resolveTimer = (over: Partial<TimerLike> = {}): TimerLike => ({
  metric: 'RESOLVE', startedAt: t0, dueAt: min(240), targetMinutes: 240, achievedAt: null, pausedAt: null, state: 'RUNNING', ...over,
});
const responseTimer = (over: Partial<TimerLike> = {}): TimerLike => ({
  metric: 'RESPONSE', startedAt: t0, dueAt: min(15), targetMinutes: 15, achievedAt: null, pausedAt: null, state: 'RUNNING', ...over,
});

describe('สถานะ Incident', () => {
  it('อนุญาตเฉพาะการเปลี่ยนสถานะที่ถูกต้อง', () => {
    expect(canTransition('NEW', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('NEW', 'CLOSED')).toBe(false);
    expect(canTransition('RESOLVED', 'IN_PROGRESS')).toBe(true); // reopen
    expect(allowedTransitions('CLOSED')).toEqual([]);
  });
  it('แปลงสถานะเป็นขั้นวงจรชีวิต 1–5', () => {
    expect(lifecycleStep('NEW')).toBe(1);
    expect(lifecycleStep('PENDING_VENDOR')).toBe(3);
    expect(lifecycleStep('CLOSED')).toBe(5);
  });
});

describe('timerView', () => {
  it('คำนวณเวลาคงเหลือและสถานะใกล้ครบกำหนด', () => {
    const v = timerView(resolveTimer(), min(200)); // เหลือ 40/240 = 16.7%
    expect(v.state).toBe('RUNNING');
    expect(Math.round(v.pct)).toBe(17);
    expect(v.near).toBe(true);
  });
  it('เกินกำหนดเมื่อ dueAt ผ่านไปแล้ว', () => {
    expect(timerView(resolveTimer(), min(241)).state).toBe('BREACHED');
  });
  it('หยุดเวลาเมื่อ pausedAt มีค่า', () => {
    const v = timerView(resolveTimer({ pausedAt: min(60), state: 'PAUSED' }), min(500));
    expect(v.state).toBe('PAUSED');
    expect(v.leftMs).toBe(180 * 60_000);
  });
  it('บรรลุแล้วถ้า achievedAt ไม่เกิน dueAt', () => {
    expect(timerView(responseTimer({ achievedAt: min(4) }), min(100)).state).toBe('MET');
    expect(timerView(responseTimer({ achievedAt: min(20) }), min(100)).state).toBe('BREACHED');
  });
});

describe('timerEffects', () => {
  it('ออกจาก NEW → บันทึกเวลาตอบสนอง', () => {
    const [p] = timerEffects([responseTimer()], 'NEW', 'ASSIGNED', min(4));
    expect(p.data.state).toBe('MET');
    expect(p.data.achievedAt).toEqual(min(4));
  });
  it('เข้า PENDING_USER → หยุด, ออก → เดินต่อโดยขยาย dueAt', () => {
    const [pause] = timerEffects([resolveTimer()], 'IN_PROGRESS', 'PENDING_USER', min(60));
    expect(pause.data.state).toBe('PAUSED');
    const paused = resolveTimer({ pausedAt: min(60), state: 'PAUSED' });
    const [resume] = timerEffects([paused], 'PENDING_USER', 'IN_PROGRESS', min(100));
    expect(resume.data.dueAt).toEqual(min(280)); // หยุดไป 40 นาที
    expect(resume.data.pausedAt).toBeNull();
    expect(resume.data.state).toBe('RUNNING');
  });
  it('RESOLVED → MET/BREACHED ตามเวลาที่ปิด', () => {
    expect(timerEffects([resolveTimer()], 'IN_PROGRESS', 'RESOLVED', min(100))[0].data.state).toBe('MET');
    expect(timerEffects([resolveTimer()], 'IN_PROGRESS', 'RESOLVED', min(300))[0].data.state).toBe('BREACHED');
  });
  it('เปิดใหม่ (reopen) ล้าง achievedAt', () => {
    const done = resolveTimer({ achievedAt: min(100), state: 'MET' });
    const [p] = timerEffects([done], 'RESOLVED', 'IN_PROGRESS', min(120));
    expect(p.data.achievedAt).toBeNull();
    expect(p.data.state).toBe('RUNNING');
  });
});

describe('retarget / format', () => {
  it('เปลี่ยนเป้าหมายโดยคงส่วนที่ขยายจากการหยุดเวลา', () => {
    const shifted = { startedAt: t0, targetMinutes: 240, dueAt: min(280) }; // ขยาย 40 นาที
    expect(retarget(shifted, 300).dueAt).toEqual(min(340));
  });
  it('จัดรูปแบบเวลา', () => {
    expect(formatHms(42 * 60_000 + 18_000)).toBe('00:42:18');
    expect(formatHms(-5000)).toBe('-00:00:05');
    expect(formatTargetMinutes(15)).toBe('15 นาที');
    expect(formatTargetMinutes(240)).toBe('4 ชั่วโมง');
    expect(formatTargetMinutes(2880)).toBe('2 วัน');
  });
});
