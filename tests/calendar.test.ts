import { describe, expect, it } from 'vitest';
import { buildEvents, conflictMap, foldLine, groupByDay, parseShow, toIcs, type ChangeRow, type ProblemRow } from '@/lib/calendar';

const d = (s: string) => new Date(s);
const chg = (o: Partial<ChangeRow> & { id: string; seq: number }): ChangeRow => ({
  title: `change ${o.seq}`, type: 'NORMAL', status: 'SCHEDULED', windowStart: d('2026-10-10T15:00:00Z'), windowEnd: d('2026-10-10T17:00:00Z'), serviceId: null, ciIds: [], ...o,
});
const prb = (o: Partial<ProblemRow> & { id: string; seq: number }): ProblemRow => ({ title: `problem ${o.seq}`, phase: 'CONTROL', targetDate: null, resolvedAt: null, ...o });
const NOW = d('2026-10-04T05:00:00Z');

describe('conflictMap', () => {
  it('ช่วงเวลาทับกันและแตะ CI เดียวกัน → ชนทั้งสองฝั่ง', () => {
    const m = conflictMap([chg({ id: 'a', seq: 1, ciIds: ['x'] }), chg({ id: 'b', seq: 2, ciIds: ['x'], windowStart: d('2026-10-10T16:00:00Z'), windowEnd: d('2026-10-10T18:00:00Z') })]);
    expect(m.get('a')).toEqual(['CHG-0002']);
    expect(m.get('b')).toEqual(['CHG-0001']);
  });
  it('ทับเวลาแต่คนละ CI/บริการ → ไม่ชน; ช่วงต่อกันพอดี → ไม่ชน', () => {
    expect(conflictMap([chg({ id: 'a', seq: 1, ciIds: ['x'] }), chg({ id: 'b', seq: 2, ciIds: ['y'] })]).size).toBe(0);
    const touching = conflictMap([chg({ id: 'a', seq: 1, serviceId: 's' }), chg({ id: 'b', seq: 2, serviceId: 's', windowStart: d('2026-10-10T17:00:00Z'), windowEnd: d('2026-10-10T18:00:00Z') })]);
    expect(touching.size).toBe(0);
  });
  it('บริการเดียวกันและเวลาทับกันก็ชน; Change ที่ปิดแล้วไม่นับ', () => {
    expect(conflictMap([chg({ id: 'a', seq: 1, serviceId: 's' }), chg({ id: 'b', seq: 2, serviceId: 's' })]).size).toBe(2);
    expect(conflictMap([chg({ id: 'a', seq: 1, serviceId: 's' }), chg({ id: 'b', seq: 2, serviceId: 's', status: 'CANCELLED' })]).size).toBe(0);
  });
});

describe('buildEvents', () => {
  it('Problem: มีกำหนด → เหตุการณ์กำหนดแก้; เลยกำหนด → เตือน; แก้แล้ว → เหตุการณ์แก้ไขแล้ว; ไม่มีกำหนด → ไม่ขึ้น', () => {
    const ev = buildEvents([], [
      prb({ id: '1', seq: 1, targetDate: d('2026-10-10T17:00:00Z') }), // 11 ต.ค. เวลาไทย (อนาคต)
      prb({ id: '2', seq: 2, targetDate: d('2026-09-30T17:00:00Z') }), // 1 ต.ค. (อดีต)
      prb({ id: '3', seq: 3, phase: 'RESOLVED', resolvedAt: d('2026-10-02T03:00:00Z'), targetDate: d('2026-10-01T17:00:00Z') }),
      prb({ id: '4', seq: 4 }),
    ], NOW);
    expect(ev.map((e) => [e.docNo, e.tag, e.overdue])).toEqual([
      ['PRB-0002', 'PROBLEM_OVERDUE', true],
      ['PRB-0003', 'PROBLEM_RESOLVED', false],
      ['PRB-0001', 'PROBLEM_DUE', false],
    ]);
  });
  it('วันครบกำหนดคือวันนี้ (เวลาไทย) ยังไม่เลยกำหนด', () => {
    const ev = buildEvents([], [prb({ id: '1', seq: 1, targetDate: d('2026-10-03T17:00:00Z') })], NOW); // 4 ต.ค. 00:00 ไทย
    expect(ev[0].overdue).toBe(false);
  });
  it('เรียงตามเวลา และ Change มีลิงก์/ธงชนกัน', () => {
    const ev = buildEvents([chg({ id: 'b', seq: 2, serviceId: 's', windowStart: d('2026-10-11T00:00:00Z'), windowEnd: d('2026-10-11T02:00:00Z') }), chg({ id: 'a', seq: 1, serviceId: 's', windowStart: d('2026-10-11T01:00:00Z'), windowEnd: null })], [], NOW);
    expect(ev.map((e) => e.docNo)).toEqual(['CHG-0002', 'CHG-0001']);
    expect(ev[0].href).toBe('/changes/CHG-0002');
    expect(ev.every((e) => e.conflictWith.length === 1)).toBe(true);
  });
});

describe('groupByDay / parseShow', () => {
  it('จัดกลุ่มตามวันที่เวลาไทย (17:00Z = วันถัดไป)', () => {
    const ev = buildEvents([chg({ id: 'a', seq: 1, windowStart: d('2026-10-10T17:30:00Z'), windowEnd: null })], [], NOW);
    expect([...groupByDay(ev).keys()]).toEqual(['2026-10-11']);
  });
  it('parseShow: ไม่ระบุ/ค่าขยะ = ทั้งสอง', () => {
    expect(parseShow(undefined)).toEqual({ change: true, problem: true });
    expect(parseShow('xx')).toEqual({ change: true, problem: true });
    expect(parseShow('change')).toEqual({ change: true, problem: false });
    expect(parseShow('problem,change')).toEqual({ change: true, problem: true });
  });
});

describe('toIcs', () => {
  const ev = buildEvents([chg({ id: 'a', seq: 7, title: 'ปรับปรุง, ระบบ; "ERP"\nบรรทัดสอง' })], [prb({ id: 'p', seq: 3, targetDate: d('2026-10-30T17:00:00Z') })], NOW);
  const ics = toIcs(ev, 'https://itsm.example.com/', NOW);
  it('โครงสร้างถูกต้อง ใช้ CRLF และปิดท้ายด้วยขึ้นบรรทัดใหม่', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });
  it('Change เป็นช่วงเวลา UTC, Problem เป็นกิจรรมทั้งวันตามวันที่ไทย', () => {
    expect(ics).toContain('DTSTART:20261010T150000Z');
    expect(ics).toContain('DTEND:20261010T170000Z');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031'); // 17:00Z วันที่ 30 = 31 ต.ค. เวลาไทย
    expect(ics).toContain('DTEND;VALUE=DATE:20261101');
  });
  it('escape อักขระพิเศษและขึ้นบรรทัดใหม่ในหัวข้อ (กัน property injection)', () => {
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('SUMMARY:CHG-0007 ปรับปรุง\\, ระบบ\\; "ERP"\\nบรรทัดสอง');
    expect(unfolded).not.toMatch(/\r\n(บรรทัดสอง)/);
  });
  it('URL ใช้ baseUrl ที่ตัด / ท้าย; UID ไม่ซ้ำ', () => {
    expect(ics).toContain('URL:https://itsm.example.com/changes/CHG-0007');
    expect(ics).toContain('UID:chg-a@servicehub');
    expect(ics).toContain('UID:prb-due-p@servicehub');
  });
  it('foldLine: ไม่เกิน 75 octet ต่อบรรทัด และไม่ตัดกลางอักขระไทย', () => {
    const long = `SUMMARY:${'ก'.repeat(80)}`;
    const folded = foldLine(long);
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
});
