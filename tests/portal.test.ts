import { describe, expect, it } from 'vitest';
import { answersToLevels, dayDiffBangkok, incidentBars, isValidScore, parsePortalDocNo, searchTokens } from '@/lib/portal';
import { calcPriority } from '@/lib/priority';

describe('portal helpers', () => {
  it('แปลงคำตอบผู้ใช้เป็น impact/urgency แล้วได้ priority ตามเมทริกซ์', () => {
    const a = answersToLevels('HIGH', 'HIGH');
    expect(calcPriority(a.impact, a.urgency)).toBe('P1');
    const b = answersToLevels('LOW', 'LOW');
    expect(calcPriority(b.impact, b.urgency)).toBe('P4');
    const c = answersToLevels('MED', 'HIGH');
    expect(calcPriority(c.impact, c.urgency)).toBe('P2');
  });
  it('ค่าที่ไม่ถูกต้องไม่ทำให้ priority สูงเกินจริง', () => {
    expect(answersToLevels('<script>', '')).toEqual({ impact: 'LOW', urgency: 'MED' });
  });
  it('แถบความคืบหน้าของ Incident', () => {
    expect(incidentBars('NEW')).toBe(1);
    expect(incidentBars('PENDING_USER')).toBe(2);
    expect(incidentBars('IN_PROGRESS')).toBe(3);
    expect(incidentBars('CLOSED')).toBe(4);
  });
  it('แยกคำค้น ตัดคำสั้นและคำซ้ำ', () => {
    expect(searchTokens('VPN  vpn, ใช้ไม่ได้ a')).toEqual(['VPN', 'vpn', 'ใช้ไม่ได้']);
    expect(searchTokens('')).toEqual([]);
  });
  it('แยกเลขที่เอกสาร', () => {
    expect(parsePortalDocNo('inc-24811')).toEqual({ kind: 'INC', seq: 24811 });
    expect(parsePortalDocNo('REQ-10291')).toEqual({ kind: 'REQ', seq: 10291 });
    expect(parsePortalDocNo('CHG-1')).toBeNull();
  });
  it('ตรวจคะแนน 1–5', () => {
    expect([1, 5].every(isValidScore)).toBe(true);
    expect([0, 6, 2.5, NaN].some(isValidScore)).toBe(false);
  });
  it('จำนวนวันตามเวลาไทย (ข้ามเที่ยงคืน UTC+7)', () => {
    // 01:00 ไทยวันที่ 3 = 18:00 UTC วันที่ 2 ; เทียบกับ 23:00 ไทยวันที่ 2
    expect(dayDiffBangkok(new Date('2026-10-02T16:00:00Z'), new Date('2026-10-02T18:00:00Z'))).toBe(1);
    expect(dayDiffBangkok(new Date('2026-10-01T05:00:00Z'), new Date('2026-10-02T05:00:00Z'))).toBe(1);
    expect(dayDiffBangkok(new Date('2026-10-02T01:00:00Z'), new Date('2026-10-02T05:00:00Z'))).toBe(0);
  });
});
