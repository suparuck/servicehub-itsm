import { describe, expect, it } from 'vitest';
import { formatMinutes, isValidCode, normalizeCode, validateCatalogItem, validateOffering, validateService } from '@/lib/catalogue';
import { can } from '@/lib/permissions';

const base = { code: 'erp', name: 'ERP', fullName: '', category: '', ownerName: '', slaId: '', sortOrder: '' };

describe('validateService', () => {
  it('รหัสถูก normalize เป็นตัวพิมพ์ใหญ่ และค่าว่างกลายเป็น null', () => {
    const r = validateService(base, { requireCode: true });
    expect(r.errors).toEqual([]);
    expect(r.clean).toEqual({ code: 'ERP', name: 'ERP', fullName: null, category: null, ownerName: null, slaId: null, sortOrder: 0 });
  });
  it('ปฏิเสธรหัสที่รูปแบบผิด (ช่องว่าง อักขระพิเศษ สั้น/ยาวไป ขึ้นต้นด้วยขีด)', () => {
    for (const bad of ['', 'A', 'a b', 'ERP/1', '-ERP', 'ERP_1', 'ก', 'A'.repeat(21), '../x']) {
      expect(validateService({ ...base, code: bad }, { requireCode: true }).errors.join(), bad).toContain('รหัสบริการ');
    }
    for (const ok of ['ERP', 'HR-PAY', 'M365', 'A1', 'A'.repeat(20)]) expect(isValidCode(normalizeCode(ok)), ok).toBe(true);
  });
  it('แก้ไขไม่ตรวจรหัส (แก้ไม่ได้อยู่แล้ว) แต่ยังตรวจชื่อ/ความยาว/ลำดับ', () => {
    expect(validateService({ ...base, code: '', name: '  ' }, { requireCode: false }).errors).toEqual(['กรุณาระบุชื่อบริการ']);
    const long = validateService({ ...base, name: 'x'.repeat(101), fullName: 'y'.repeat(151), category: 'z'.repeat(81), ownerName: 'w'.repeat(101) }, { requireCode: true });
    expect(long.errors).toHaveLength(4); // ชื่อ ชื่อเต็ม หมวดหมู่ เจ้าของ (รหัส erp ถูกต้อง)
  });
  it('ลำดับแสดงต้องเป็นจำนวนเต็ม 0–9999', () => {
    for (const bad of ['-1', '1.5', 'abc', '10000']) expect(validateService({ ...base, sortOrder: bad }, { requireCode: true }).errors.join(), bad).toContain('ลำดับ');
    expect(validateService({ ...base, sortOrder: '12' }, { requireCode: true }).clean.sortOrder).toBe(12);
  });
});

describe('validateOffering / validateCatalogItem', () => {
  it('ข้อเสนอบริการ: ต้องมีชื่อ ความยาวจำกัด', () => {
    expect(validateOffering({ name: ' ', description: '' }).errors).toHaveLength(1);
    expect(validateOffering({ name: 'a', description: 'b'.repeat(401) }).errors).toHaveLength(1);
    expect(validateOffering({ name: ' VPN ', description: ' ' }).clean).toEqual({ name: 'VPN', description: null });
  });
  it('รายการพอร์ทัล: ต้องมีชื่อ ตัวอย่าง และระยะเวลาส่งมอบ', () => {
    expect(validateCatalogItem({ name: '', items: '', slaText: '', sortOrder: '' }).errors).toHaveLength(3);
    const ok = validateCatalogItem({ name: ' อุปกรณ์ ', items: ' โน้ตบุ๊ก ', slaText: ' 3 วัน ', sortOrder: '2' });
    expect(ok.errors).toEqual([]);
    expect(ok.clean).toEqual({ name: 'อุปกรณ์', items: 'โน้ตบุ๊ก', slaText: '3 วัน', sortOrder: 2 });
  });
});

describe('formatMinutes', () => {
  it('แปลงนาทีเป็นข้อความไทย', () => {
    expect(formatMinutes(30)).toBe('30 นาที');
    expect(formatMinutes(240)).toBe('4 ชม.');
    expect(formatMinutes(90)).toBe('1 ชม. 30 นาที');
    expect(formatMinutes(2880)).toBe('2 วัน');
    expect(formatMinutes(1500)).toBe('25 ชม.');
  });
});

describe('สิทธิ์ catalogue.manage', () => {
  it('หัวหน้าทีม ผู้จัดการ CMDB และผู้ดูแลจัดการได้ ผู้ใช้ปลายทางและเจ้าหน้าที่ทั่วไปไม่ได้', () => {
    for (const r of ['RESOLVER_GROUP_LEAD', 'CONFIG_MANAGER', 'ADMIN'] as const) expect(can(r, 'catalogue.manage'), r).toBe(true);
    for (const r of ['END_USER', 'AGENT', 'CAB_MEMBER', 'CHANGE_MANAGER'] as const) expect(can(r, 'catalogue.manage'), r).toBe(false);
    expect(can(null, 'catalogue.manage')).toBe(false);
  });
});
