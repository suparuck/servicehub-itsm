import { describe, expect, it } from 'vitest';
import { canMoveImpStatus, daysOverdue, isOverdue, isStep, needsReason, nextImpStatuses, validateComplete, validateImprovement, validateStepMove, type ImpFormInput, type StepContext } from '@/lib/improvement';
import { can } from '@/lib/permissions';
import { formatDocNo, parseDocNo } from '@/lib/docno';

const empty: StepContext = { description: null, baseline: null, goal: null, result: null };
const full: StepContext = { description: 'วิสัยทัศน์', baseline: 'MTTR 4 ชม.', goal: 'MTTR 3 ชม.', result: 'MTTR 2.9 ชม.' };

describe('validateStepMove', () => {
  it('ไปข้างหน้าได้ทีละขั้น ข้ามขั้นไม่ได้ ย้อนกลับได้ทุกขั้น', () => {
    expect(validateStepMove(2, 4, full)).toContain('ข้ามขั้น');
    expect(validateStepMove(1, 7, full)).toContain('ข้ามขั้น');
    expect(validateStepMove(5, 6, full)).toBeNull();
    expect(validateStepMove(6, 2, empty)).toBeNull(); // ย้อนไม่ตรวจประตู
    expect(validateStepMove(4, 4, full)).toContain('อยู่ขั้นนี้อยู่แล้ว');
  });
  it('ประตูตรวจ: วิสัยทัศน์ → ค่าฐาน → เป้าหมาย → ผลที่ได้', () => {
    expect(validateStepMove(1, 2, empty)).toContain('ขั้นที่ 1');
    expect(validateStepMove(1, 2, { ...empty, description: ' ' })).toContain('ขั้นที่ 1'); // ช่องว่างล้วนไม่นับ
    expect(validateStepMove(1, 2, { ...empty, description: 'x' })).toBeNull();
    expect(validateStepMove(2, 3, { ...empty, description: 'x' })).toContain('ค่าฐาน');
    expect(validateStepMove(3, 4, { ...empty, baseline: 'x' })).toContain('เป้าหมาย');
    expect(validateStepMove(4, 5, empty)).toBeNull(); // ขั้น 4→5 ไม่มีประตู (วางแผนวิธีการ)
    expect(validateStepMove(5, 6, empty)).toBeNull();
    expect(validateStepMove(6, 7, { ...empty, goal: 'x' })).toContain('ผลที่ได้');
    expect(validateStepMove(6, 7, full)).toBeNull();
  });
  it('ขั้นที่ไม่อยู่ใน 1–7 ถูกปฏิเสธ', () => {
    for (const bad of [0, 8, -1, 1.5, NaN]) expect(validateStepMove(bad, 2, full), String(bad)).toBe('ขั้นไม่ถูกต้อง');
    expect(isStep(7)).toBe(true);
    expect(isStep('3')).toBe(false);
  });
});

describe('validateComplete', () => {
  it('ปิดได้เมื่ออยู่ขั้น 6+ มีผลที่ได้ และยังเปิดอยู่', () => {
    expect(validateComplete(6, 'OPEN', full)).toBeNull();
    expect(validateComplete(7, 'OPEN', full)).toBeNull();
    expect(validateComplete(5, 'OPEN', full)).toContain('ขั้นที่ 6');
    expect(validateComplete(6, 'OPEN', { ...full, result: ' ' })).toContain('ผลที่ได้');
    expect(validateComplete(6, 'ON_HOLD', full)).toContain('กำลังดำเนินการ');
    expect(validateComplete(6, 'DONE', full)).toContain('กำลังดำเนินการ');
  });
});

describe('สถานะ', () => {
  it('ยกเลิกแล้วจบ; เสร็จแล้วเปิดใหม่ได้; พัก/ยกเลิกต้องมีเหตุผล', () => {
    expect(nextImpStatuses('CANCELLED')).toEqual([]);
    expect(canMoveImpStatus('DONE', 'OPEN')).toBe(true);
    expect(canMoveImpStatus('DONE', 'ON_HOLD')).toBe(false);
    expect(canMoveImpStatus('ON_HOLD', 'DONE')).toBe(false); // ต้องกลับมาดำเนินการก่อนปิด
    expect(canMoveImpStatus('OPEN', 'OPEN')).toBe(false);
    expect(needsReason('ON_HOLD')).toBe(true);
    expect(needsReason('CANCELLED')).toBe(true);
    expect(needsReason('DONE')).toBe(false);
    expect(needsReason('OPEN')).toBe(false);
  });
});

describe('isOverdue', () => {
  const NOW = new Date('2026-10-05T05:00:00Z'); // 5 ต.ค. เวลาไทย
  it('เลยเมื่อวันเป้าหมายผ่านไปแล้วและยังเปิดอยู่เท่านั้น', () => {
    expect(isOverdue({ status: 'OPEN', targetDate: new Date('2026-10-04T17:00:00Z') }, NOW)).toBe(false); // วันนี้ (5 ต.ค.) 00:00 ไทย — ยังไม่เลย
    expect(isOverdue({ status: 'OPEN', targetDate: new Date('2026-10-03T17:00:00Z') }, NOW)).toBe(true); // เมื่อวาน (4 ต.ค.) 00:00 ไทย
    expect(isOverdue({ status: 'ON_HOLD', targetDate: new Date('2026-09-01T00:00:00Z') }, NOW)).toBe(false);
    expect(isOverdue({ status: 'DONE', targetDate: new Date('2026-09-01T00:00:00Z') }, NOW)).toBe(false);
    expect(isOverdue({ status: 'OPEN', targetDate: null }, NOW)).toBe(false);
  });
});

describe('daysOverdue', () => {
  const NOW = new Date('2026-10-05T05:00:00Z'); // 5 ต.ค. เวลาไทย
  it('นับวันตามปฏิทินไทย: วันนี้ = 0, เมื่อวาน = 1, พรุ่งนี้ = -1', () => {
    expect(daysOverdue(new Date('2026-10-04T17:00:00Z'), NOW)).toBe(0); // 5 ต.ค. 00:00 ไทย
    expect(daysOverdue(new Date('2026-10-03T17:00:00Z'), NOW)).toBe(1);
    expect(daysOverdue(new Date('2026-09-30T17:00:00Z'), NOW)).toBe(4); // 1 ต.ค. 00:00 ไทย
    expect(daysOverdue(new Date('2026-10-05T17:00:00Z'), NOW)).toBe(-1);
  });
  it('สอดคล้องกับ isOverdue (เลย ⇔ มากกว่า 0 วันและยังเปิดอยู่)', () => {
    for (const iso of ['2026-10-04T17:00:00Z', '2026-10-03T17:00:00Z', '2026-10-05T17:00:00Z']) {
      const d = new Date(iso);
      expect(isOverdue({ status: 'OPEN', targetDate: d }, NOW)).toBe(daysOverdue(d, NOW) > 0);
    }
  });
});

const base: ImpFormInput = { title: 'ลด MTTR', description: '', baseline: '', goal: '', result: '', benefit: 'MED', ownerId: '', targetDate: '', problemId: '', serviceId: '' };
describe('validateImprovement', () => {
  it('ค่าว่างกลายเป็น null และวันที่เป็นเวลาไทย', () => {
    const r = validateImprovement({ ...base, description: ' เหตุผล ', targetDate: '2026-12-31' });
    expect(r.errors).toEqual([]);
    expect(r.clean).toMatchObject({ title: 'ลด MTTR', description: 'เหตุผล', baseline: null, ownerId: null, targetDate: new Date('2026-12-30T17:00:00Z'), benefit: 'MED' });
  });
  it('ปฏิเสธหัวข้อว่าง/ยาวไป ระดับประโยชน์ผิด วันที่ไม่มีจริง และข้อความยาวเกิน', () => {
    expect(validateImprovement({ ...base, title: ' ' }).errors).toEqual(['กรุณาระบุหัวข้อ']);
    expect(validateImprovement({ ...base, title: 'x'.repeat(201) }).errors).toEqual(['หัวข้อยาวเกิน 200 ตัวอักษร']);
    expect(validateImprovement({ ...base, benefit: 'X' }).errors).toEqual(['ระดับประโยชน์ไม่ถูกต้อง']);
    expect(validateImprovement({ ...base, targetDate: '2026-02-30' }).errors.join()).toContain('วันเป้าหมาย');
    expect(validateImprovement({ ...base, goal: 'g'.repeat(2001) }).errors.join()).toContain('เป้าหมายยาวเกิน');
  });
});

describe('เลขที่เอกสาร IMP และสิทธิ์', () => {
  it('IMP-0007 ไป-กลับได้', () => {
    expect(formatDocNo('IMP', 7)).toBe('IMP-0007');
    expect(parseDocNo('IMP', 'imp-0012')).toBe(12);
    expect(parseDocNo('IMP', 'INC-1')).toBeNull();
  });
  it('improvement.manage: เจ้าหน้าที่ขึ้นไปทำได้ ผู้ใช้ปลายทางและ CAB ไม่ได้', () => {
    for (const r of ['AGENT', 'RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'CONFIG_MANAGER', 'ADMIN'] as const) expect(can(r, 'improvement.manage'), r).toBe(true);
    for (const r of ['END_USER', 'CAB_MEMBER'] as const) expect(can(r, 'improvement.manage'), r).toBe(false);
  });
});
