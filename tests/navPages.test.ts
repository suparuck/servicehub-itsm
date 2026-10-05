import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flatNav } from '@/lib/nav';

const root = join(__dirname, '..', 'src', 'app');
// หน้าจริงของพาธหนึ่ง อยู่ใน (app), (portal) หรือรากของ app
const hasRealPage = (href: string) => {
  const seg = href === '/' ? '' : href.replace(/^\//, '');
  return ['(app)', '(portal)', '.'].some((g) => existsSync(join(root, g, seg, 'page.tsx')));
};

describe('เมนูกับหน้าที่มีอยู่จริง', () => {
  it('ทุกเมนูใน sidebar มีหน้าจริง (ไม่มีลิงก์ที่ 404 และไม่เหลือหน้า placeholder)', () => {
    const missing = flatNav.filter((n) => !hasRealPage(n.href)).map((n) => n.href);
    expect(missing).toEqual([]);
  });
  it('ไม่มีหน้า catch-all ที่ตอบหน้าหลอกสำหรับพาธที่ไม่มีอยู่จริง', () => {
    expect(existsSync(join(root, '(app)', '[...slug]'))).toBe(false);
  });
});
