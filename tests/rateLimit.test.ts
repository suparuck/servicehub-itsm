import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAILURES, MAX_FAILURES_PER_IP, WINDOW_MS, clearFailures, isLocked, minutesUntilUnlock, recordFailure, resetAllForTests } from '@/lib/rateLimit';

describe('login rate limit', () => {
  beforeEach(resetAllForTests);
  it('ล็อกเมื่อผิดครบกำหนด', () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure('a', 1000);
    expect(isLocked('a', 1000)).toBe(false);
    recordFailure('a', 1000);
    expect(isLocked('a', 1000)).toBe(true);
  });
  it('เกณฑ์ต่อไอพีสูงกว่าต่อบัญชี', () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure('ip:1', 0);
    expect(isLocked('ip:1', 1, MAX_FAILURES_PER_IP)).toBe(false);
    for (let i = MAX_FAILURES; i < MAX_FAILURES_PER_IP; i++) recordFailure('ip:1', 0);
    expect(isLocked('ip:1', 1, MAX_FAILURES_PER_IP)).toBe(true);
  });
  it('คีย์แยกกัน', () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure('a', 1000);
    expect(isLocked('b', 1000)).toBe(false);
  });
  it('ปลดล็อกเองเมื่อพ้นช่วงเวลา และนับใหม่', () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure('a', 0);
    expect(isLocked('a', WINDOW_MS - 1)).toBe(true);
    expect(isLocked('a', WINDOW_MS + 1)).toBe(false);
    recordFailure('a', WINDOW_MS + 2);
    expect(isLocked('a', WINDOW_MS + 2)).toBe(false);
  });
  it('ล็อกอินสำเร็จล้างตัวนับ', () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure('a', 0);
    clearFailures('a');
    expect(isLocked('a', 1)).toBe(false);
  });
  it('บอกนาทีที่เหลือ', () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure('a', 0);
    expect(minutesUntilUnlock('a', 60_000)).toBe(14);
    expect(minutesUntilUnlock('zzz', 0)).toBe(0);
  });
});
