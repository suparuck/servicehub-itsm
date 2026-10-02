import { describe, expect, it } from 'vitest';
import { approvalOutcome, deliverCheck, isFinished, requestStage } from '@/lib/request';

describe('request lifecycle', () => {
  it('ขั้นปัจจุบัน', () => {
    expect(requestStage('PENDING_APPROVAL')).toBe(2);
    expect(requestStage('FULFILLING')).toBe(3);
    expect(requestStage('DELIVERED')).toBe(4);
  });
  it('สถานะที่จบแล้ว', () => {
    expect(isFinished('DELIVERED')).toBe(true);
    expect(isFinished('FULFILLING')).toBe(false);
  });
  it('ส่งมอบได้เมื่องานเสร็จครบ', () => {
    expect(deliverCheck('FULFILLING', [{ done: true }, { done: true }])).toBeNull();
    expect(deliverCheck('FULFILLING', [])).toBeNull();
    expect(deliverCheck('FULFILLING', [{ done: true }, { done: false }])).toMatch(/1 รายการ/);
    expect(deliverCheck('PENDING_APPROVAL', [])).toMatch(/จัดเตรียม/);
  });
  it('ผลอนุมัติ', () => {
    expect(approvalOutcome([])).toBe('PENDING');
    expect(approvalOutcome(['APPROVED', null])).toBe('PENDING');
    expect(approvalOutcome(['APPROVED', 'APPROVED'])).toBe('APPROVED');
    expect(approvalOutcome(['APPROVED', 'REJECTED'])).toBe('REJECTED');
  });
});
