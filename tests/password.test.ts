import { describe, expect, it } from 'vitest';
import { MIN_LENGTH, generateTempPassword, validatePassword } from '@/lib/password';
import { checkUserChange, initialsOf, normalizeEmail } from '@/lib/userRules';

describe('validatePassword', () => {
  it('รหัสที่แข็งแรงผ่าน', () => {
    expect(validatePassword('Tr0ub4dor&Horse', { email: 'somsak@servicehub.local' })).toEqual([]);
  });
  it('สั้นเกินไป', () => {
    expect(validatePassword('Ab1!')[0]).toContain(`${MIN_LENGTH}`);
  });
  it('ต้องมีอย่างน้อย 3 ชนิดตัวอักษร', () => {
    expect(validatePassword('abcdefghijkl')).toContainEqual(expect.stringContaining('3 ชนิด'));
    expect(validatePassword('abcdefgh12')).toContainEqual(expect.stringContaining('3 ชนิด'));
    expect(validatePassword('abcdefG123')).toEqual([]);
  });
  it('ตัวอักษรไทยนับเป็นสัญลักษณ์/อื่น ๆ', () => {
    expect(validatePassword('รหัสผ่านใหม่Ab1')).toEqual([]);
  });
  it('ปฏิเสธรหัสที่เดาง่ายและที่ซ้ำกับอีเมล', () => {
    expect(validatePassword('Password123!')).toContainEqual(expect.stringContaining('เดาง่าย'));
    expect(validatePassword('ServiceHub-2026!')).toContainEqual(expect.stringContaining('เดาง่าย'));
    expect(validatePassword('Somsak#2026xyz', { email: 'somsak@servicehub.local' })).toContainEqual(expect.stringContaining('อีเมล'));
  });
  it('ต้องไม่ซ้ำกับรหัสเดิม', () => {
    expect(validatePassword('Tr0ub4dor&Horse', { currentPassword: 'Tr0ub4dor&Horse' })).toContainEqual(expect.stringContaining('ซ้ำกับรหัสเดิม'));
  });
  it('ยาวเกินกำหนดถูกปฏิเสธ (กัน DoS ของ bcrypt)', () => {
    expect(validatePassword('Aa1!' + 'x'.repeat(130))).toContainEqual(expect.stringContaining('ไม่เกิน'));
  });
});

describe('generateTempPassword', () => {
  it('ยาว 16 มีครบทุกชนิด และผ่านนโยบาย', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[!@#$%&*?]/);
      expect(p).not.toMatch(/[0O1lI]/); // ไม่มีตัวที่อ่านสับสน
      expect(validatePassword(p)).toEqual([]);
    }
  });
  it('ไม่ซ้ำกันในทางปฏิบัติ', () => {
    expect(new Set(Array.from({ length: 200 }, () => generateTempPassword())).size).toBe(200);
  });
  it('ใช้ rng ที่ฉีดเข้ามาได้ (ผลทำซ้ำได้)', () => {
    const rng = (n: number) => n - 1;
    expect(generateTempPassword(16, rng)).toBe(generateTempPassword(16, rng));
  });
});

describe('checkUserChange', () => {
  const admin = { id: 'a1', role: 'ADMIN' as const, active: true };
  const agent = { id: 'u1', role: 'AGENT' as const, active: true };
  it('ปิดบัญชีหรือลดบทบาทตัวเองไม่ได้', () => {
    expect(checkUserChange('a1', admin, { role: 'ADMIN', active: false }, 2)).toMatch(/ปิดบัญชีของตัวเอง/);
    expect(checkUserChange('a1', admin, { role: 'AGENT', active: true }, 2)).toMatch(/ลดบทบาท/);
  });
  it('ต้องเหลือแอดมินอย่างน้อย 1 คน', () => {
    expect(checkUserChange('a2', admin, { role: 'AGENT', active: true }, 1)).toMatch(/อย่างน้อย 1 คน/);
    expect(checkUserChange('a2', admin, { role: 'ADMIN', active: false }, 1)).toMatch(/อย่างน้อย 1 คน/);
    expect(checkUserChange('a2', admin, { role: 'AGENT', active: true }, 2)).toBeNull();
  });
  it('แก้ผู้ใช้ทั่วไปได้', () => {
    expect(checkUserChange('a1', agent, { role: 'RESOLVER_GROUP_LEAD', active: false }, 1)).toBeNull();
  });
  it('แอดมินที่ถูกปิดอยู่แล้วไม่นับเป็นแอดมินที่ใช้งาน', () => {
    expect(checkUserChange('a1', { ...admin, id: 'a3', active: false }, { role: 'AGENT', active: false }, 1)).toBeNull();
  });
});

describe('userRules helpers', () => {
  it('normalizeEmail', () => {
    expect(normalizeEmail('  Foo@Example.COM ')).toBe('foo@example.com');
    expect(normalizeEmail('bad email@x.com')).toBeNull();
    expect(normalizeEmail('no-at.com')).toBeNull();
  });
  it('initialsOf (ไทย/อังกฤษ)', () => {
    expect(initialsOf('สมศักดิ์ ชื่นใจ')).toBe('สช');
    expect(initialsOf('Jane Doe')).toBe('JD');
    expect(initialsOf('Cher')).toBe('CH');
  });
});
