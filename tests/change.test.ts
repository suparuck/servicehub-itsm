import { describe, expect, it } from 'vitest';
import { bangkokYmd, boardFor, buildMonthGrid, canMove, evaluateApprovals, findConflicts, parseMonthParam, shiftMonth, validateSubmit } from '@/lib/change';

const d = (s: string) => new Date(s);

describe('change workflow', () => {
  it('เส้นทางสถานะ', () => {
    expect(canMove('DRAFT', 'AWAITING_APPROVAL')).toBe(true);
    expect(canMove('DRAFT', 'IMPLEMENTING')).toBe(false);
    expect(canMove('IMPLEMENTING', 'COMPLETED')).toBe(true);
    expect(canMove('COMPLETED', 'DRAFT')).toBe(false);
  });
  it('คณะที่พิจารณา', () => {
    expect(boardFor('STANDARD')).toBeNull();
    expect(boardFor('NORMAL')).toBe('CAB');
    expect(boardFor('EMERGENCY')).toBe('ECAB');
  });
});

describe('evaluateApprovals', () => {
  it('Normal ต้องครบทุกคน', () => {
    expect(evaluateApprovals('NORMAL', ['APPROVED', 'PENDING'])).toBe('PENDING');
    expect(evaluateApprovals('NORMAL', ['APPROVED', 'APPROVED'])).toBe('APPROVED');
  });
  it('Emergency อนุมัติ 1 คนก็พอ แต่ถ้ามีคนไม่อนุมัติ = ไม่ผ่าน', () => {
    expect(evaluateApprovals('EMERGENCY', ['APPROVED', 'PENDING', 'PENDING'])).toBe('APPROVED');
    expect(evaluateApprovals('EMERGENCY', ['APPROVED', 'REJECTED'])).toBe('REJECTED');
    expect(evaluateApprovals('EMERGENCY', ['PENDING', 'PENDING'])).toBe('PENDING');
  });
  it('ไม่มีผู้อนุมัติ = รอ', () => {
    expect(evaluateApprovals('NORMAL', [])).toBe('PENDING');
  });
});

describe('validateSubmit', () => {
  const now = d('2026-10-02T00:00:00Z');
  const base = { title: 'x', type: 'NORMAL' as const, windowStart: d('2026-10-05T00:00:00Z'), windowEnd: d('2026-10-05T02:00:00Z'), implementationPlan: 'a', backoutPlan: 'b' };
  it('ผ่านเมื่อครบ', () => expect(validateSubmit(base, now)).toEqual([]));
  it('Normal ต้องมีแผนและอนาคต', () => {
    expect(validateSubmit({ ...base, implementationPlan: '', backoutPlan: ' ' }, now)).toHaveLength(2);
    expect(validateSubmit({ ...base, windowStart: d('2026-10-01T00:00:00Z'), windowEnd: null }, now)).toHaveLength(1);
  });
  it('Standard ไม่บังคับแผนและย้อนหลังได้', () => {
    expect(validateSubmit({ ...base, type: 'STANDARD', implementationPlan: '', backoutPlan: '', windowStart: d('2026-10-01T00:00:00Z'), windowEnd: null }, now)).toEqual([]);
  });
  it('เวลาสิ้นสุดต้องหลังเริ่ม', () => {
    expect(validateSubmit({ ...base, windowEnd: d('2026-10-04T00:00:00Z') }, now)[0]).toMatch(/สิ้นสุด/);
  });
});

describe('findConflicts', () => {
  const a = { id: 'a', windowStart: d('2026-10-05T01:00:00Z'), windowEnd: d('2026-10-05T03:00:00Z'), serviceId: 's1', ciIds: ['c1'] };
  it('ทับเวลาและใช้ CI ร่วมกัน', () => {
    const b = { id: 'b', windowStart: d('2026-10-05T02:00:00Z'), windowEnd: d('2026-10-05T04:00:00Z'), serviceId: 's2', ciIds: ['c1'], status: 'APPROVED' as const };
    expect(findConflicts(a, [b])).toEqual([{ change: b, reason: 'CI' }]);
  });
  it('บริการเดียวกันแต่คนละ CI', () => {
    const b = { id: 'b', windowStart: d('2026-10-05T01:30:00Z'), windowEnd: null, serviceId: 's1', ciIds: ['c9'] };
    expect(findConflicts(a, [b])[0].reason).toBe('SERVICE');
  });
  it('ไม่ทับเวลา / ปิดแล้ว / ตัวเอง ไม่นับ', () => {
    const later = { id: 'b', windowStart: d('2026-10-05T03:00:00Z'), windowEnd: d('2026-10-05T04:00:00Z'), serviceId: 's1', ciIds: ['c1'] };
    const closed = { id: 'c', windowStart: a.windowStart, windowEnd: a.windowEnd, serviceId: 's1', ciIds: ['c1'], status: 'CANCELLED' as const };
    expect(findConflicts(a, [later, closed, a])).toEqual([]);
  });
});

describe('calendar', () => {
  it('ตารางเดือน ต.ค. 2026 เริ่มวันอาทิตย์ และมีทุกวันของเดือน', () => {
    const grid = buildMonthGrid(2026, 10);
    expect(grid[0][0].ymd).toBe('2026-09-27'); // 1 ต.ค. 2026 = วันพฤหัสบดี
    const inMonth = grid.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });
  it('เลื่อนเดือนข้ามปี', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it('parseMonthParam และวันที่ตามเวลาไทย', () => {
    expect(parseMonthParam('2026-03')).toEqual({ year: 2026, month: 3 });
    expect(parseMonthParam('2026-13', d('2026-10-02T00:00:00Z'))).toEqual({ year: 2026, month: 10 });
    expect(bangkokYmd(d('2026-10-01T18:00:00Z'))).toBe('2026-10-02'); // 01:00 ไทย
  });
});
