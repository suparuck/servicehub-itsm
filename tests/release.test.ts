import { describe, expect, it } from 'vitest';
import { canAddChange, canEditPackage, canEditPlan, canMoveRel, canReview, goNoGo, goReady, isFinalRel, nextRelStatuses, parseBkkDateTime, validateRelMove, validateRelease, type RelFormInput, type ReleaseLike } from '@/lib/release';
import { formatDocNo } from '@/lib/docno';
import { can } from '@/lib/permissions';

const good: ReleaseLike = { ownerId: 'u1', windowStart: new Date('2026-10-10T15:00:00Z'), windowEnd: new Date('2026-10-10T17:00:00Z'), deployPlan: 'ติดตั้งตามลำดับ', rollbackPlan: 'คืนค่าเดิม' };
const approved = [{ docNo: 'CHG-3376', status: 'APPROVED' as const }, { docNo: 'CHG-3370', status: 'SCHEDULED' as const }];

describe('วงจรสถานะ', () => {
  it('ไปข้างหน้าทีละขั้น ย้อนจัดเตรียมได้ แต่สถานะสุดท้ายย้ายต่อไม่ได้', () => {
    expect(nextRelStatuses('PLANNED')).toEqual(['IN_BUILD', 'CANCELLED']);
    expect(canMoveRel('PLANNED', 'READY')).toBe(false); // ข้าม IN_BUILD ไม่ได้
    expect(canMoveRel('READY', 'IN_BUILD')).toBe(true);
    expect(canMoveRel('DEPLOYING', 'CANCELLED')).toBe(false); // เริ่มเปิดใช้แล้วยกเลิกไม่ได้ ต้องถอยกลับ
    expect(canMoveRel('DEPLOYING', 'ROLLED_BACK')).toBe(true);
    for (const s of ['DEPLOYED', 'ROLLED_BACK', 'CANCELLED'] as const) {
      expect(nextRelStatuses(s), s).toEqual([]);
      expect(isFinalRel(s)).toBe(true);
    }
    expect(isFinalRel('READY')).toBe(false);
  });
  it('สิทธิ์แก้ไขตามสถานะ: แพ็กเกจ (วางแผน/จัดเตรียม) · แผน (ถึง READY) · ทบทวน (หลังจบ)', () => {
    expect([canEditPackage('PLANNED'), canEditPackage('IN_BUILD'), canEditPackage('READY'), canEditPackage('DEPLOYING')]).toEqual([true, true, false, false]);
    expect([canEditPlan('READY'), canEditPlan('DEPLOYING'), canEditPlan('DEPLOYED')]).toEqual([true, false, false]);
    expect([canReview('DEPLOYED'), canReview('ROLLED_BACK'), canReview('CANCELLED'), canReview('READY')]).toEqual([true, true, false, false]);
  });
});

describe('canAddChange', () => {
  it('เฉพาะ Change ที่อนุมัติ/จัดตารางแล้ว และยังไม่อยู่ใน Release ใด', () => {
    expect(canAddChange({ status: 'APPROVED', releaseId: null }, 'r1')).toBeNull();
    expect(canAddChange({ status: 'SCHEDULED', releaseId: null }, 'r1')).toBeNull();
    for (const s of ['DRAFT', 'AWAITING_APPROVAL', 'IMPLEMENTING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const) expect(canAddChange({ status: s, releaseId: null }, 'r1'), s).toContain('อนุมัติแล้ว');
    expect(canAddChange({ status: 'APPROVED', releaseId: 'r1' }, 'r1')).toContain('อยู่ใน Release นี้แล้ว');
    expect(canAddChange({ status: 'APPROVED', releaseId: 'r2' }, 'r1')).toContain('Release อื่น');
  });
});

describe('goNoGo', () => {
  it('ผ่านทุกข้อเมื่อครบ', () => {
    const items = goNoGo(good, approved);
    expect(items.every((i) => i.ok)).toBe(true);
    expect(goReady(items)).toBe(true);
  });
  it('แพ็กเกจว่างไม่ผ่านทั้ง "มี Change" และ "อนุมัติครบ" (ว่างไม่ถือว่าอนุมัติครบ)', () => {
    const m = Object.fromEntries(goNoGo(good, []).map((i) => [i.key, i.ok]));
    expect(m).toMatchObject({ changes: false, approved: false });
  });
  it('Change ที่ยังไม่อนุมัติทำให้ไม่ผ่านและระบุเลขที่', () => {
    const items = goNoGo(good, [...approved, { docNo: 'CHG-3365', status: 'AWAITING_APPROVAL' }, { docNo: 'CHG-3300', status: 'CANCELLED' }]);
    const a = items.find((i) => i.key === 'approved')!;
    expect(a.ok).toBe(false);
    expect(a.detail).toBe('CHG-3365, CHG-3300');
  });
  it('ขาดเจ้าของ/ช่วงเวลา/แผน (ข้อความว่างล้วนไม่นับ) ไม่ผ่าน', () => {
    const m = (r: Partial<ReleaseLike>) => Object.fromEntries(goNoGo({ ...good, ...r }, approved).map((i) => [i.key, i.ok]));
    expect(m({ ownerId: null }).owner).toBe(false);
    expect(m({ windowStart: null }).window).toBe(false);
    expect(m({ windowEnd: good.windowStart }).window).toBe(false); // สิ้นสุดไม่หลังเริ่ม
    expect(m({ deployPlan: '  ' }).deployPlan).toBe(false);
    expect(m({ rollbackPlan: null }).rollbackPlan).toBe(false);
  });
});

describe('validateRelMove', () => {
  const ctx = { release: good, changes: approved };
  it('READY/DEPLOYING ต้องผ่าน Go/No-Go และบอกข้อที่ไม่ผ่าน', () => {
    expect(validateRelMove('IN_BUILD', 'READY', ctx)).toBeNull();
    expect(validateRelMove('IN_BUILD', 'READY', { ...ctx, release: { ...good, rollbackPlan: null } })).toContain('แผนถอยกลับ');
    expect(validateRelMove('READY', 'DEPLOYING', { ...ctx, changes: [...approved, { docNo: 'CHG-1', status: 'CANCELLED' }] })).toContain('Go/No-Go'); // ตรวจซ้ำตอนเริ่มเปิดใช้
  });
  it('DEPLOYED ต้องให้ทุก Change เสร็จสิ้น', () => {
    expect(validateRelMove('DEPLOYING', 'DEPLOYED', ctx)).toContain('CHG-3376, CHG-3370');
    expect(validateRelMove('DEPLOYING', 'DEPLOYED', { ...ctx, changes: [{ docNo: 'CHG-3376', status: 'COMPLETED' }, { docNo: 'CHG-3370', status: 'FAILED' }] })).toContain('CHG-3370');
    expect(validateRelMove('DEPLOYING', 'DEPLOYED', { ...ctx, changes: [{ docNo: 'CHG-3376', status: 'COMPLETED' }] })).toBeNull();
  });
  it('ถอยกลับ/ยกเลิก/ย้อนขั้นต้องมีเหตุผล', () => {
    expect(validateRelMove('DEPLOYING', 'ROLLED_BACK', ctx)).toBe('ต้องระบุเหตุผล');
    expect(validateRelMove('DEPLOYING', 'ROLLED_BACK', { ...ctx, reason: ' ' })).toBe('ต้องระบุเหตุผล');
    expect(validateRelMove('DEPLOYING', 'ROLLED_BACK', { ...ctx, reason: 'ระบบช้าลง' })).toBeNull();
    expect(validateRelMove('PLANNED', 'CANCELLED', ctx)).toBe('ต้องระบุเหตุผล');
    expect(validateRelMove('READY', 'IN_BUILD', ctx)).toBe('ต้องระบุเหตุผล');
    expect(validateRelMove('PLANNED', 'IN_BUILD', ctx)).toBeNull(); // เดินหน้าไม่ต้องมีเหตุผล
  });
  it('การย้ายที่ไม่อยู่ในวงจรถูกปฏิเสธก่อนตรวจอื่น', () => {
    expect(validateRelMove('PLANNED', 'DEPLOYED', ctx)).toContain('ไม่ได้');
    expect(validateRelMove('DEPLOYED', 'PLANNED', ctx)).toContain('ไม่ได้');
  });
});

describe('parseBkkDateTime', () => {
  it('เวลาไทย → UTC; ว่าง → null; ผิด → undefined', () => {
    expect(parseBkkDateTime('2026-10-10T22:00')).toEqual(new Date('2026-10-10T15:00:00Z'));
    expect(parseBkkDateTime('')).toBeNull();
    for (const bad of ['2026-10-10', '2026-10-10 22:00', '2026-02-30T10:00', '2026-13-01T00:00', '2026-10-10T25:00', 'x']) expect(parseBkkDateTime(bad), bad).toBeUndefined();
  });
});

const form: RelFormInput = { name: 'Release 2026.10', version: '', description: '', ownerId: '', serviceId: '', windowStart: '', windowEnd: '', deployPlan: '', rollbackPlan: '' };
describe('validateRelease', () => {
  it('ค่าว่างเป็น null; ช่วงเวลาเป็นเวลาไทย', () => {
    const r = validateRelease({ ...form, version: ' 2026.10 ', windowStart: '2026-10-10T22:00', windowEnd: '2026-10-11T00:00' });
    expect(r.errors).toEqual([]);
    expect(r.clean).toMatchObject({ version: '2026.10', ownerId: null, windowStart: new Date('2026-10-10T15:00:00Z'), windowEnd: new Date('2026-10-10T17:00:00Z') });
  });
  it('ปฏิเสธชื่อว่าง/ยาวไป ช่วงเวลาผิด ไม่คู่กัน และข้อความยาวเกิน', () => {
    expect(validateRelease({ ...form, name: ' ' }).errors).toEqual(['กรุณาระบุชื่อ Release']);
    expect(validateRelease({ ...form, name: 'x'.repeat(151), version: 'v'.repeat(41) }).errors).toHaveLength(2);
    expect(validateRelease({ ...form, windowStart: '2026-10-10T22:00', windowEnd: '2026-10-10T21:00' }).errors).toEqual(['เวลาสิ้นสุดต้องหลังเวลาเริ่ม']);
    expect(validateRelease({ ...form, windowStart: '2026-10-10T22:00' }).errors).toEqual(['ต้องระบุเวลาเริ่มและสิ้นสุดคู่กัน']);
    expect(validateRelease({ ...form, windowStart: 'abc' }).errors.join()).toContain('เวลาเริ่มเปิดใช้ไม่ถูกต้อง');
    expect(validateRelease({ ...form, deployPlan: 'p'.repeat(4001) }).errors.join()).toContain('แผนการเปิดใช้ยาวเกิน');
  });
});

describe('เลขที่และสิทธิ์', () => {
  it('REL-0007', () => expect(formatDocNo('REL', 7)).toBe('REL-0007'));
  it('release.manage: หัวหน้าทีม ผู้จัดการ Change และผู้ดูแลเท่านั้น', () => {
    for (const r of ['RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'ADMIN'] as const) expect(can(r, 'release.manage'), r).toBe(true);
    for (const r of ['AGENT', 'END_USER', 'CAB_MEMBER', 'CONFIG_MANAGER'] as const) expect(can(r, 'release.manage'), r).toBe(false);
  });
});
