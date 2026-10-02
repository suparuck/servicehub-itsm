import { describe, expect, it } from 'vitest';
import { dependencies, dependents, normalize, tierOf, wouldCreateCycle, type Rel } from '@/lib/cmdbGraph';

// BS → APP → DB → HOST ; DB runs on HOST, HOST hosts VM (HOSTS กลับทิศ)
const rels: Rel[] = [
  { sourceId: 'BS', targetId: 'APP', type: 'DEPENDS_ON' },
  { sourceId: 'APP', targetId: 'DB', type: 'DEPENDS_ON' },
  { sourceId: 'DB', targetId: 'VM', type: 'RUNS_ON' },
  { sourceId: 'HOST', targetId: 'VM', type: 'HOSTS' }, // VM ขึ้นอยู่กับ HOST
];

describe('cmdbGraph', () => {
  it('HOSTS กลับทิศเป็น dependent → dependency', () => {
    expect(normalize([rels[3]])).toEqual([{ from: 'VM', to: 'HOST' }]);
  });
  it('impact analysis: ไล่ขึ้นหาผู้ที่ขึ้นอยู่กับ CI', () => {
    expect([...dependents('DB', rels)].sort()).toEqual(['APP', 'BS']);
    expect([...dependents('HOST', rels)].sort()).toEqual(['APP', 'BS', 'DB', 'VM']);
    expect(dependents('BS', rels).size).toBe(0);
  });
  it('ไล่ลงหาสิ่งที่ CI พึ่งพา', () => {
    expect([...dependencies('APP', rels)].sort()).toEqual(['DB', 'HOST', 'VM']);
  });
  it('ตรวจจับวงวนและการชี้ตัวเอง', () => {
    expect(wouldCreateCycle({ sourceId: 'DB', targetId: 'BS', type: 'DEPENDS_ON' }, rels)).toBe(true);
    expect(wouldCreateCycle({ sourceId: 'X', targetId: 'X', type: 'DEPENDS_ON' }, rels)).toBe(true);
    expect(wouldCreateCycle({ sourceId: 'BS', targetId: 'DB', type: 'DEPENDS_ON' }, rels)).toBe(false);
  });
  it('ไม่วนไม่รู้จบเมื่อกราฟมีวงอยู่แล้ว', () => {
    const cyc: Rel[] = [
      { sourceId: 'A', targetId: 'B', type: 'DEPENDS_ON' },
      { sourceId: 'B', targetId: 'A', type: 'DEPENDS_ON' },
    ];
    expect([...dependents('A', cyc)]).toEqual(['B']);
  });
  it('จัดชั้นตามคลาส', () => {
    expect(tierOf('BUSINESS_SERVICE')).toBe(0);
    expect(tierOf('DATABASE')).toBe(2);
    expect(tierOf('SERVER')).toBe(3);
  });
});
