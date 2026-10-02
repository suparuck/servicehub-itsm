import { describe, expect, it } from 'vitest';
import { isSessionStale } from '@/lib/session';

const at = (ms: number) => new Date(ms);

describe('isSessionStale', () => {
  it('ไม่เคยเปลี่ยนรหัสผ่าน → ไม่หมดอายุ', () => {
    expect(isSessionStale(1000, null)).toBe(false);
    expect(isSessionStale(undefined, undefined)).toBe(false);
  });
  it('ล็อกอินก่อนเปลี่ยนรหัสผ่าน → หมดอายุ', () => {
    expect(isSessionStale(1000, at(2000))).toBe(true);
  });
  it('ล็อกอินหลังเปลี่ยนรหัสผ่าน → ใช้ได้', () => {
    expect(isSessionStale(3000, at(2000))).toBe(false);
  });
  it('ในวินาทีเดียวกันแต่ก่อนการเปลี่ยน → ต้องหมดอายุ (เคยรอดเพราะเทียบระดับวินาที)', () => {
    const changed = Date.parse('2026-10-02T10:00:00.800Z');
    const loggedInEarlierSameSecond = Date.parse('2026-10-02T10:00:00.200Z');
    expect(isSessionStale(loggedInEarlierSameSecond, at(changed))).toBe(true);
    expect(isSessionStale(Date.parse('2026-10-02T10:00:00.900Z'), at(changed))).toBe(false);
  });
  it('เท่ากันพอดี → ถือว่าเก่า (ปฏิเสธไว้ก่อน)', () => {
    expect(isSessionStale(5000, at(5000))).toBe(true);
  });
  it('session ที่ไม่มีเวลาล็อกอิน (token เก่า) หลังมีการเปลี่ยนรหัสผ่าน → หมดอายุ', () => {
    expect(isSessionStale(undefined, at(1))).toBe(true);
  });
});
