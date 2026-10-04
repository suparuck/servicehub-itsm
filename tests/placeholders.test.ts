import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flatNav } from '@/lib/nav';
import { PLACEHOLDERS, placeholderFor } from '@/lib/placeholders';

const root = join(__dirname, '..', 'src', 'app');
// หน้าจริงของพาธหนึ่ง อยู่ใน (app), (portal) หรือรากของ app
const hasRealPage = (href: string) => {
  const seg = href === '/' ? '' : href.replace(/^\//, '');
  return ['(app)', '(portal)', '.'].some((g) => existsSync(join(root, g, seg, 'page.tsx')));
};

describe('เมนูกับหน้าที่มีอยู่จริง', () => {
  it('ทุกเมนูมีหน้าจริง หรือมีหน้า placeholder (ไม่มีลิงก์ใน sidebar ที่ 404)', () => {
    const missing = flatNav.filter((n) => !hasRealPage(n.href) && !placeholderFor(n.href)).map((n) => n.href);
    expect(missing).toEqual([]);
  });
  it('placeholder ต้องผูกกับเมนูจริง และเมื่อพัฒนาหน้าจริงแล้วต้องลบ placeholder ออก (ไม่ให้ค้าง)', () => {
    const navHrefs = new Set(flatNav.map((n) => n.href));
    for (const p of PLACEHOLDERS) {
      expect(navHrefs.has(p.href), `${p.href} ไม่อยู่ในเมนู`).toBe(true);
      expect(hasRealPage(p.href), `${p.href} มีหน้าจริงแล้ว ควรลบออกจาก PLACEHOLDERS`).toBe(false);
    }
  });
  it('ลิงก์ที่เกี่ยวข้องชี้ไปหน้าที่มีอยู่จริงหรือเป็นหน้าโมดูลในเมนู', () => {
    const navHrefs = new Set(flatNav.map((n) => n.href));
    for (const p of PLACEHOLDERS) {
      for (const r of p.related) expect(hasRealPage(r.href) || navHrefs.has(r.href), `${p.href} → ${r.href}`).toBe(true);
    }
  });
  it('เนื้อหาครบ: มีสรุป ขอบเขต และลิงก์ที่เกี่ยวข้อง', () => {
    for (const p of PLACEHOLDERS) {
      expect(p.practice.length).toBeGreaterThan(3);
      expect(p.summary.length).toBeGreaterThan(20);
      expect(p.planned.length).toBeGreaterThanOrEqual(3);
      expect(p.related.length).toBeGreaterThanOrEqual(1);
    }
  });
});
