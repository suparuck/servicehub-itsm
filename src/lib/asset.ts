// IT Asset Management — กติกา (ฟังก์ชันบริสุทธิ์ ทดสอบได้โดยไม่ใช้ DB)
import { parseBkkDate } from './dateInput';

export type AssetStatus = 'ORDERED' | 'IN_STOCK' | 'IN_USE' | 'IN_REPAIR' | 'RETIRED';
export type CiClassKey = 'BUSINESS_SERVICE' | 'APPLICATION' | 'SERVER' | 'DATABASE' | 'NETWORK_DEVICE' | 'CLOUD_RESOURCE' | 'END_USER_DEVICE' | 'SOFTWARE_LICENSE';

/** คลาส CI ที่เป็นสินทรัพย์ (ฮาร์ดแวร์และไลเซนส์) — ตาม CLAUDE.md: Asset ผูก 1:1 กับ CI ที่เป็นฮาร์ดแวร์/ไลเซนส์ */
export const ASSET_CLASSES: CiClassKey[] = ['SERVER', 'NETWORK_DEVICE', 'END_USER_DEVICE', 'SOFTWARE_LICENSE'];
export const isAssetClass = (c: string): c is CiClassKey => (ASSET_CLASSES as string[]).includes(c);
export const isLicenseClass = (c: string) => c === 'SOFTWARE_LICENSE';

const TAG_PREFIX: Partial<Record<CiClassKey, string>> = { SERVER: 'SRV', NETWORK_DEVICE: 'NET', END_USER_DEVICE: 'EUD', SOFTWARE_LICENSE: 'LIC' };

/** เลขแท็กถัดไปของคลาสนั้น เช่น ASSET-EUD-0004 (ต่อจากเลขสูงสุดที่มี ไม่ใช่จำนวนรายการ — ลบ/ข้ามเลขแล้วไม่ซ้ำ) */
export function nextAssetTag(ciClass: CiClassKey, existingTags: string[]): string {
  const prefix = TAG_PREFIX[ciClass];
  if (!prefix) throw new Error(`คลาส ${ciClass} ไม่ใช่สินทรัพย์`);
  const re = new RegExp(`^ASSET-${prefix}-(\\d+)$`);
  const max = existingTags.reduce((m, t) => Math.max(m, Number(re.exec(t)?.[1] ?? 0)), 0);
  return `ASSET-${prefix}-${String(max + 1).padStart(4, '0')}`;
}

// ── วงจรชีวิต ──
const NEXT: Record<AssetStatus, AssetStatus[]> = {
  ORDERED: ['IN_STOCK', 'RETIRED'],
  IN_STOCK: ['IN_USE', 'IN_REPAIR', 'RETIRED'],
  IN_USE: ['IN_STOCK', 'IN_REPAIR', 'RETIRED'],
  IN_REPAIR: ['IN_STOCK', 'IN_USE', 'RETIRED'],
  RETIRED: [],
};
export const nextStatuses = (s: AssetStatus) => NEXT[s];
export const canMoveStatus = (from: AssetStatus, to: AssetStatus) => NEXT[from].includes(to);

// ── ประกัน/MA/ไลเซนส์หมดอายุ ──
export const EXPIRING_DAYS = 90;
export type SupportState = 'NONE' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED';
const DAY = 86_400_000;
const bkkDay = (d: Date) => Math.floor((d.getTime() + 7 * 3_600_000) / DAY);

/** วันที่ตามเวลาไทย: หมดอายุวันนี้ยังถือว่าใช้ได้ถึงสิ้นวัน; ≤ 90 วัน = ใกล้หมด */
export function supportState(until: Date | null | undefined, now = new Date(), window = EXPIRING_DAYS): SupportState {
  if (!until) return 'NONE';
  const left = bkkDay(until) - bkkDay(now);
  if (left < 0) return 'EXPIRED';
  return left <= window ? 'EXPIRING' : 'ACTIVE';
}

export const daysLeft = (until: Date, now = new Date()) => bkkDay(until) - bkkDay(now);

/**
 * ขั้นของการแจ้งเตือนวันหมดอายุ: เตือนเมื่อเหลือ ≤ 90 / ≤ 30 / ≤ 7 วัน และเมื่อหมดแล้ว (คืน 0 ตอนหมดอายุ/เกินกำหนด)
 * คืน null เมื่อยังเหลือมากกว่า 90 วัน — แต่ละขั้นส่งครั้งเดียวต่อวันหมดอายุ (กุญแจกันซ้ำรวมวันหมดอายุไว้ ต่ออายุแล้วเริ่มนับใหม่)
 */
export const DEFAULT_ALERT_DAYS = [90, 30, 7];
export const ALERT_STEPS = DEFAULT_ALERT_DAYS;
/** steps ต้องเรียงมากไปน้อย (ได้จาก parseAlertDays) — ขั้นปัจจุบัน = ขั้นที่น้อยที่สุดที่ยังมากกว่าหรือเท่ากับจำนวนวันที่เหลือ */
export function alertStep(days: number, steps: number[] = DEFAULT_ALERT_DAYS): number | null {
  if (days < 0) return 0;
  let found: number | null = null;
  for (const s of steps) if (days <= s && (found === null || s < found)) found = s;
  return found;
}

/** กรอบ "ใกล้หมด" ที่แสดงในหน้าสินทรัพย์ = ขั้นแจ้งเตือนที่ไกลที่สุด (เตือนตั้งแต่เมื่อไหร่ ก็ถือว่าใกล้หมดตั้งแต่นั้น) */
export const expiringWindow = (steps: number[]) => (steps.length ? Math.max(...steps) : EXPIRING_DAYS);

export const MAX_ALERT_DAYS = 365;
export const MAX_ALERT_STEPS = 5;

/** แปลงข้อความเกณฑ์วัน (คั่นด้วย , ; ช่องว่าง) เป็นรายการเรียงมากไปน้อย — จำนวนเต็ม 1–365 ไม่ซ้ำ 1–5 ค่า */
export function parseAlertDays(input: string): { ok: true; days: number[] } | { ok: false; error: string } {
  const parts = input.split(/[\s,;，、]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'กรุณาระบุจำนวนวันอย่างน้อย 1 ค่า (เช่น 90, 30, 7)' };
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return { ok: false, error: `“${p.slice(0, 20)}” ไม่ใช่จำนวนเต็มวัน` };
    const n = Number(p);
    if (n < 1 || n > MAX_ALERT_DAYS) return { ok: false, error: `จำนวนวันต้องอยู่ระหว่าง 1 ถึง ${MAX_ALERT_DAYS} (พบ ${p.slice(0, 20)})` };
    nums.push(n);
  }
  const days = [...new Set(nums)].sort((a, b) => b - a);
  if (days.length > MAX_ALERT_STEPS) return { ok: false, error: `ตั้งได้ไม่เกิน ${MAX_ALERT_STEPS} ค่า` };
  return { ok: true, days };
}

// ── ไลเซนส์ ──
export type LicenseState = 'NA' | 'OK' | 'NEAR' | 'OVER';
export const NEAR_PCT = 90;
/** ใช้เกินสิทธิ์ = ไม่ comply; ≥ 90% = ใกล้เต็ม */
export function licenseState(qty: number | null | undefined, used: number | null | undefined): LicenseState {
  if (qty == null || used == null) return 'NA';
  if (used > qty) return 'OVER';
  if (qty > 0 && (used / qty) * 100 >= NEAR_PCT) return 'NEAR';
  return 'OK';
}

// ── ตรวจข้อมูล ──
export interface AssetFormInput {
  vendor: string;
  serialNo: string;
  location: string;
  costBaht: string;
  purchasedAt: string;
  supportUntil: string;
  licenseQty: string;
  licenseUsed: string;
}

export interface AssetClean {
  vendor: string | null;
  serialNo: string | null;
  location: string | null;
  costBaht: number | null;
  purchasedAt: Date | null;
  supportUntil: Date | null;
  licenseQty: number | null;
  licenseUsed: number | null;
}

export function validateAsset(input: AssetFormInput, ciClass: string): { errors: string[]; clean: AssetClean } {
  const errors: string[] = [];
  const text = (v: string, max: number, label: string) => {
    const t = v.trim();
    if (t.length > max) errors.push(`${label}ยาวเกิน ${max} ตัวอักษร`);
    return t || null;
  };
  const int = (v: string, max: number, label: string) => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    if (!/^\d+$/.test(t) || !Number.isSafeInteger(n) || n > max) {
      errors.push(`${label}ต้องเป็นจำนวนเต็มไม่ติดลบ ไม่เกิน ${max.toLocaleString('en-US')}`);
      return null;
    }
    return n;
  };
  const date = (v: string, label: string) => {
    const r = parseBkkDate(v);
    if ('error' in r) {
      errors.push(`${label}: ${r.error}`);
      return null;
    }
    return r.date;
  };
  const license = isLicenseClass(ciClass);
  const clean: AssetClean = {
    vendor: text(input.vendor, 100, 'ผู้ขาย/ผู้ผลิต'),
    serialNo: text(input.serialNo, 80, 'Serial No.'),
    location: text(input.location, 100, 'สถานที่'),
    costBaht: int(input.costBaht, 1_000_000_000, 'มูลค่า'),
    purchasedAt: date(input.purchasedAt, 'วันที่ซื้อ'),
    supportUntil: date(input.supportUntil, license ? 'วันหมดอายุไลเซนส์' : 'สิ้นสุดประกัน/MA'),
    licenseQty: null,
    licenseUsed: null,
  };
  if (license) {
    clean.licenseQty = int(input.licenseQty, 10_000_000, 'จำนวนสิทธิ์ที่ซื้อ');
    clean.licenseUsed = int(input.licenseUsed, 10_000_000, 'จำนวนสิทธิ์ที่ใช้');
    if (clean.licenseUsed !== null && clean.licenseQty === null) errors.push('ต้องระบุจำนวนสิทธิ์ที่ซื้อเมื่อระบุจำนวนที่ใช้');
  }
  if (clean.purchasedAt && clean.supportUntil && clean.supportUntil.getTime() < clean.purchasedAt.getTime()) errors.push('วันสิ้นสุดต้องไม่ก่อนวันที่ซื้อ');
  return { errors, clean };
}

// ── CSV (รายงานสำหรับตรวจนับ/ตรวจสอบ) ──
/** กัน CSV/Formula injection: ค่าที่ขึ้นต้นด้วย = + - @ tab CR ถูกใส่ ' นำหน้า แล้วครอบเครื่องหมายคำพูดตามมาตรฐาน */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: unknown[][]) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`; // BOM ให้ Excel อ่านภาษาไทยถูกต้อง
