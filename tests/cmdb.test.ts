import { describe, expect, it } from 'vitest';
import { daysSince, diffFields, formatAttributes, nextCiId, parseAttributes } from '@/lib/cmdb';

describe('cmdb helpers', () => {
  it('nextCiId ต่อจากเลขสูงสุดของคลาสเดียวกัน', () => {
    expect(nextCiId('DATABASE', ['CI-DB-00216', 'CI-DB-00217', 'CI-APP-0099'])).toBe('CI-DB-00218');
    expect(nextCiId('APPLICATION', [])).toBe('CI-APP-0001');
    expect(nextCiId('APPLICATION', ['CI-APP-0041'])).toBe('CI-APP-0042');
  });
  it('parseAttributes / formatAttributes แปลงไป-กลับ', () => {
    const o = parseAttributes('IP Address: 10.0.0.1\nตั้งค่า: a: b\nไม่มีโคลอน\n: ไม่มีชื่อ\nว่าง:   ');
    expect(o).toEqual({ 'IP Address': '10.0.0.1', 'ตั้งค่า': 'a: b' });
    expect(parseAttributes(formatAttributes(o))).toEqual(o);
  });
  it('diffFields บอกเฉพาะที่เปลี่ยน', () => {
    expect(diffFields({ a: '1', b: '2' }, { a: '1', b: '3', c: 'x' })).toEqual(['b: 2 → 3', 'c: — → x']);
  });
  it('daysSince', () => {
    expect(daysSince(new Date('2026-06-14T00:00:00Z'), new Date('2026-10-02T00:00:00Z'))).toBe(110);
    expect(daysSince(null)).toBeNull();
  });
});
