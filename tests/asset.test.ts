import { describe, expect, it } from 'vitest';
import { ALERT_STEPS, ASSET_CLASSES, alertStep, canMoveStatus, csvCell, daysLeft, isAssetClass, licenseState, nextAssetTag, nextStatuses, supportState, toCsv, validateAsset, type AssetFormInput } from '@/lib/asset';
import { can } from '@/lib/permissions';

const blank: AssetFormInput = { vendor: '', serialNo: '', location: '', costBaht: '', purchasedAt: '', supportUntil: '', licenseQty: '', licenseUsed: '' };
const NOW = new Date('2026-10-04T05:00:00Z'); // 4 ต.ค. 12:00 เวลาไทย

describe('nextAssetTag', () => {
  it('ต่อจากเลขสูงสุดของคลาสนั้น ไม่ปะปนกับคลาสอื่น', () => {
    expect(nextAssetTag('END_USER_DEVICE', [])).toBe('ASSET-EUD-0001');
    expect(nextAssetTag('SERVER', ['ASSET-SRV-0891', 'ASSET-EUD-0900'])).toBe('ASSET-SRV-0892');
    expect(nextAssetTag('SOFTWARE_LICENSE', ['ASSET-LIC-0002', 'ASSET-LIC-0010', 'bad'])).toBe('ASSET-LIC-0011');
  });
  it('คลาสที่ไม่ใช่สินทรัพย์ → error; ชุดคลาสตรงกับฮาร์ดแวร์/ไลเซนส์', () => {
    expect(() => nextAssetTag('APPLICATION', [])).toThrow();
    expect(ASSET_CLASSES).toEqual(['SERVER', 'NETWORK_DEVICE', 'END_USER_DEVICE', 'SOFTWARE_LICENSE']);
    expect(isAssetClass('DATABASE')).toBe(false);
    expect(isAssetClass('SERVER')).toBe(true);
  });
});

describe('วงจรชีวิต', () => {
  it('ปลดระวางแล้วย้ายต่อไม่ได้; สั่งซื้อต้องผ่านคลังก่อนใช้งาน', () => {
    expect(nextStatuses('RETIRED')).toEqual([]);
    expect(canMoveStatus('ORDERED', 'IN_USE')).toBe(false);
    expect(canMoveStatus('ORDERED', 'IN_STOCK')).toBe(true);
    expect(canMoveStatus('IN_USE', 'IN_REPAIR')).toBe(true);
    expect(canMoveStatus('IN_REPAIR', 'IN_USE')).toBe(true);
    expect(canMoveStatus('IN_USE', 'IN_USE')).toBe(false);
  });
});

describe('supportState / daysLeft', () => {
  const at = (iso: string) => new Date(iso);
  it('ไม่มีวันที่ = NONE; หมดอายุวันนี้ยังใช้ได้; เมื่อวาน = หมดแล้ว', () => {
    expect(supportState(null, NOW)).toBe('NONE');
    expect(supportState(at('2026-10-03T17:00:00Z'), NOW)).toBe('EXPIRING'); // วันนี้ 00:00 ไทย (เหลือ 0 วัน)
    expect(supportState(at('2026-10-02T17:00:00Z'), NOW)).toBe('EXPIRED'); // 3 ต.ค. ไทย
  });
  it('เกณฑ์ 90 วัน', () => {
    expect(supportState(at('2027-01-02T00:00:00Z'), NOW)).toBe('EXPIRING'); // 90 วัน
    expect(supportState(at('2027-01-04T00:00:00Z'), NOW)).toBe('ACTIVE'); // 92 วัน
    expect(daysLeft(at('2026-10-14T05:00:00Z'), NOW)).toBe(10);
  });
});

describe('alertStep (ขั้นแจ้งเตือนวันหมดอายุ)', () => {
  it('เหลือ > 90 วันยังไม่แจ้ง; แจ้งที่ขั้น 90/30/7 และเมื่อหมดแล้ว', () => {
    expect(ALERT_STEPS).toEqual([90, 30, 7]);
    expect(alertStep(365)).toBeNull();
    expect(alertStep(91)).toBeNull();
    expect(alertStep(90)).toBe(90);
    expect(alertStep(60)).toBe(90);
    expect(alertStep(31)).toBe(90);
    expect(alertStep(30)).toBe(30);
    expect(alertStep(8)).toBe(30);
    expect(alertStep(7)).toBe(7);
    expect(alertStep(0)).toBe(7); // วันหมดอายุวันนี้ยังใช้ได้ถึงสิ้นวัน — ขั้นเตือนสุดท้าย
    expect(alertStep(-1)).toBe(0);
    expect(alertStep(-400)).toBe(0);
  });
  it('สินทรัพย์ที่เพิ่งขึ้นทะเบียนใกล้หมดแล้ว ได้เฉพาะขั้นปัจจุบัน (ไม่ย้อนแจ้งขั้นที่ผ่านมาแล้ว)', () => {
    // เหลือ 5 วัน → ขั้น 7 เท่านั้น ไม่ใช่ 90 และ 30
    expect(alertStep(5)).toBe(7);
  });
});

describe('licenseState', () => {
  it('NA / OK / NEAR (≥90%) / OVER (ใช้เกินสิทธิ์)', () => {
    expect(licenseState(null, null)).toBe('NA');
    expect(licenseState(50, null)).toBe('NA');
    expect(licenseState(50, 10)).toBe('OK');
    expect(licenseState(50, 44)).toBe('OK');
    expect(licenseState(50, 45)).toBe('NEAR');
    expect(licenseState(50, 50)).toBe('NEAR');
    expect(licenseState(50, 51)).toBe('OVER');
    expect(licenseState(0, 1)).toBe('OVER');
    expect(licenseState(0, 0)).toBe('OK');
  });
});

describe('validateAsset', () => {
  it('ค่าว่างทั้งหมดผ่าน (null ทั้งหมด)', () => {
    const r = validateAsset(blank, 'END_USER_DEVICE');
    expect(r.errors).toEqual([]);
    expect(Object.values(r.clean).every((v) => v === null)).toBe(true);
  });
  it('วันที่เป็นเวลาไทย มูลค่าเป็นจำนวนเต็ม', () => {
    const r = validateAsset({ ...blank, vendor: ' Dell ', costBaht: '45000', purchasedAt: '2026-01-15', supportUntil: '2029-01-15' }, 'END_USER_DEVICE');
    expect(r.errors).toEqual([]);
    expect(r.clean).toMatchObject({ vendor: 'Dell', costBaht: 45000, purchasedAt: new Date('2026-01-14T17:00:00Z') });
  });
  it('ปฏิเสธมูลค่า/วันที่/ความยาวที่ผิด และวันสิ้นสุดก่อนวันซื้อ', () => {
    for (const bad of ['-1', '1.5', 'abc', '1000000001', '1e3']) expect(validateAsset({ ...blank, costBaht: bad }, 'SERVER').errors.join(), bad).toContain('มูลค่า');
    expect(validateAsset({ ...blank, purchasedAt: '2026-02-30' }, 'SERVER').errors.join()).toContain('วันที่ซื้อ');
    expect(validateAsset({ ...blank, vendor: 'x'.repeat(101), serialNo: 'y'.repeat(81), location: 'z'.repeat(101) }, 'SERVER').errors).toHaveLength(3);
    expect(validateAsset({ ...blank, purchasedAt: '2026-05-01', supportUntil: '2026-04-30' }, 'SERVER').errors).toEqual(['วันสิ้นสุดต้องไม่ก่อนวันที่ซื้อ']);
  });
  it('ฟิลด์ไลเซนส์ใช้ได้เฉพาะคลาสไลเซนส์ (คลาสอื่นถูกทิ้ง) และต้องมีจำนวนซื้อถ้าระบุจำนวนที่ใช้', () => {
    expect(validateAsset({ ...blank, licenseQty: '50', licenseUsed: '10' }, 'SERVER').clean).toMatchObject({ licenseQty: null, licenseUsed: null });
    expect(validateAsset({ ...blank, licenseQty: '50', licenseUsed: '10' }, 'SOFTWARE_LICENSE').clean).toMatchObject({ licenseQty: 50, licenseUsed: 10 });
    expect(validateAsset({ ...blank, licenseUsed: '10' }, 'SOFTWARE_LICENSE').errors.join()).toContain('จำนวนสิทธิ์ที่ซื้อ');
    expect(validateAsset({ ...blank, supportUntil: '2026-13-01' }, 'SOFTWARE_LICENSE').errors.join()).toContain('วันหมดอายุไลเซนส์');
  });
});

describe('CSV', () => {
  it('กัน formula injection และครอบเครื่องหมายคำพูดเมื่อจำเป็น', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    for (const c of ['+1', '-1', '@x', '\tx']) expect(csvCell(c).replace(/^"/, '').startsWith("'")).toBe(true);
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('บรรทัด\nสอง')).toBe('"บรรทัด\nสอง"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(45000)).toBe('45000');
  });
  it('toCsv: BOM + CRLF', () => {
    const out = toCsv([['a', 'b'], [1, 'x,y']]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toBe('﻿a,b\r\n1,"x,y"\r\n');
  });
});

describe('สิทธิ์ asset.manage', () => {
  it('เจ้าหน้าที่/หัวหน้าทีม/ผู้จัดการ CMDB/ผู้ดูแลทำได้ ผู้ใช้ปลายทางและ CAB ไม่ได้', () => {
    for (const r of ['AGENT', 'RESOLVER_GROUP_LEAD', 'CONFIG_MANAGER', 'ADMIN'] as const) expect(can(r, 'asset.manage'), r).toBe(true);
    for (const r of ['END_USER', 'CAB_MEMBER', 'CHANGE_MANAGER'] as const) expect(can(r, 'asset.manage'), r).toBe(false);
  });
});
