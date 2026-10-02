import { describe, expect, it } from 'vitest';
import { aggregate, formatDuration, meanMinutes, meetsTarget, overall, pct } from '@/lib/slaStats';

describe('slaStats', () => {
  it('pct ปัด 1 ตำแหน่งและรองรับไม่มีข้อมูล', () => {
    expect(pct(32, 35)).toBe(91.4);
    expect(pct(49, 52)).toBe(94.2);
    expect(pct(0, 0)).toBeNull();
  });
  it('aggregate แยกกลุ่มและนับ breached', () => {
    const r = aggregate([
      { group: 'ERP', met: true }, { group: 'ERP', met: false }, { group: 'VPN', met: true }, { group: 'ERP', met: true },
    ]);
    expect(r).toEqual([
      { group: 'ERP', total: 3, met: 2, breached: 1, pct: 66.7 },
      { group: 'VPN', total: 1, met: 1, breached: 0, pct: 100 },
    ]);
  });
  it('overall', () => {
    expect(overall([{ group: 'a', met: true }, { group: 'b', met: false }]).pct).toBe(50);
    expect(overall([]).pct).toBeNull();
  });
  it('meanMinutes / formatDuration', () => {
    const t = new Date('2026-10-02T00:00:00Z');
    expect(meanMinutes([{ start: t, end: new Date(t.getTime() + 60 * 60_000) }, { start: t, end: new Date(t.getTime() + 150 * 60_000) }])).toBe(105);
    expect(meanMinutes([])).toBeNull();
    expect(formatDuration(204)).toBe('3.4 ชม.');
    expect(formatDuration(40)).toBe('40 นาที');
    expect(formatDuration(3000)).toBe('2.1 วัน');
    expect(formatDuration(null)).toBe('—');
  });
  it('meetsTarget ที่ 95%', () => {
    expect(meetsTarget(95)).toBe(true);
    expect(meetsTarget(94.9)).toBe(false);
    expect(meetsTarget(null)).toBe(false);
  });
});
