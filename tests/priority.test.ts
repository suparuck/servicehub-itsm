import { describe, expect, it } from 'vitest';
import { calcPriority, LEVELS } from '@/lib/priority';
import { formatDocNo, parseDocNo } from '@/lib/docno';
import { formatRemaining } from '@/lib/datetime';

describe('calcPriority', () => {
  it('ตรงกับเมทริกซ์ Impact × Urgency', () => {
    const expected = {
      HIGH: ['P1', 'P2', 'P3'],
      MED: ['P2', 'P3', 'P4'],
      LOW: ['P3', 'P4', 'P4'],
    } as const;
    for (const impact of LEVELS) {
      LEVELS.forEach((urgency, i) => {
        expect(calcPriority(impact, urgency)).toBe(expected[impact][i]);
      });
    }
  });
});

describe('docno', () => {
  it('จัดรูปแบบและแยกเลขที่เอกสาร', () => {
    expect(formatDocNo('INC', 24817)).toBe('INC-24817');
    expect(formatDocNo('PRB', 412)).toBe('PRB-0412');
    expect(formatDocNo('CHG', 3381)).toBe('CHG-3381');
    expect(parseDocNo('INC', 'inc-00042')).toBe(42);
    expect(parseDocNo('INC', 'REQ-1')).toBeNull();
  });
});

describe('formatRemaining', () => {
  it('แสดงชั่วโมง:นาที หรือวัน', () => {
    expect(formatRemaining(42)).toBe('0:42 ชม.');
    expect(formatRemaining(130)).toBe('2:10 ชม.');
    expect(formatRemaining(2 * 24 * 60)).toBe('2 วัน');
    expect(formatRemaining(-5)).toBe('เกินกำหนด');
  });
});
