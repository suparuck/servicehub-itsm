import { describe, expect, it } from 'vitest';
import { checkAccess, homeFor, safeCallback } from '@/lib/routeAccess';

describe('checkAccess', () => {
  it('หน้า login และ auth API เปิดสาธารณะ', () => {
    expect(checkAccess('/login', null)).toEqual({ allow: true });
    expect(checkAccess('/api/auth/session', null)).toEqual({ allow: true });
  });
  it('ไม่ล็อกอิน → ส่งไป /login', () => {
    expect(checkAccess('/', null)).toEqual({ allow: false, redirect: '/login' });
    expect(checkAccess('/portal', undefined)).toEqual({ allow: false, redirect: '/login' });
  });
  it('ผู้ใช้ปลายทางเข้าได้เฉพาะพอร์ทัล', () => {
    expect(checkAccess('/portal/my', 'END_USER')).toEqual({ allow: true });
    expect(checkAccess('/', 'END_USER')).toEqual({ allow: false, redirect: '/portal' });
    expect(checkAccess('/incidents/INC-1', 'END_USER')).toEqual({ allow: false, redirect: '/portal' });
    expect(checkAccess('/portalx', 'END_USER')).toEqual({ allow: false, redirect: '/portal' });
  });
  it('หน้าบัญชีของตนเอง: ทุกบทบาทที่ล็อกอินแล้ว', () => {
    expect(checkAccess('/account', 'END_USER')).toEqual({ allow: true });
    expect(checkAccess('/account', 'AGENT')).toEqual({ allow: true });
    expect(checkAccess('/account', null)).toEqual({ allow: false, redirect: '/login' });
    expect(checkAccess('/accounting', 'END_USER')).toEqual({ allow: false, redirect: '/portal' });
  });
  it('เจ้าหน้าที่เข้าได้ทั้งสองฝั่ง', () => {
    expect(checkAccess('/changes', 'AGENT')).toEqual({ allow: true });
    expect(checkAccess('/portal', 'ADMIN')).toEqual({ allow: true });
  });
  it('หน้าแรกตามบทบาท', () => {
    expect(homeFor('END_USER')).toBe('/portal');
    expect(homeFor('AGENT')).toBe('/');
  });
});

describe('safeCallback', () => {
  it('ยอมรับเฉพาะพาธภายใน', () => {
    expect(safeCallback('/changes?view=calendar')).toBe('/changes?view=calendar');
    expect(safeCallback('https://evil.example')).toBe('/');
    expect(safeCallback('https://evil.example/steal?x=1')).toBe('/steal?x=1'); // ทิ้งโฮสต์ เหลือเฉพาะพาธภายใน
    expect(safeCallback('http://0.0.0.0:3000/changes?view=calendar')).toBe('/changes?view=calendar');
    expect(safeCallback('javascript:alert(1)')).toBe('/');
    expect(safeCallback('https://evil.example//attacker.example')).toBe('/');
    expect(safeCallback('//evil.example')).toBe('/');
    expect(safeCallback('/\\evil.example')).toBe('/');
    expect(safeCallback('/login')).toBe('/');
    expect(safeCallback(null, '/portal')).toBe('/portal');
  });
});
