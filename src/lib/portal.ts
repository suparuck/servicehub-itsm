// ฟังก์ชันบริสุทธิ์ของพอร์ทัลผู้ใช้
import type { Level } from './priority';
import type { IncidentStatus } from './incident';

/**
 * ผู้ใช้ไม่ต้องรู้จัก Impact/Urgency — ถามเป็นภาษาธรรมดา 2 ข้อแล้วแปลงเป็นระดับ ITIL
 * scope: ปัญหากระทบใคร → impact · block: ทำงานต่อได้ไหม → urgency
 */
export function answersToLevels(scope: string, block: string): { impact: Level; urgency: Level } {
  const ok = (v: string): v is Level => v === 'HIGH' || v === 'MED' || v === 'LOW';
  return { impact: ok(scope) ? scope : 'LOW', urgency: ok(block) ? block : 'MED' };
}

/** จำนวนแถบความคืบหน้า (จาก 4) ของ Incident ที่แสดงให้ผู้ใช้ */
export function incidentBars(status: IncidentStatus): number {
  switch (status) {
    case 'NEW':
      return 1;
    case 'ASSIGNED':
    case 'PENDING_USER':
    case 'PENDING_VENDOR':
      return 2;
    case 'IN_PROGRESS':
      return 3;
    case 'RESOLVED':
    case 'CLOSED':
      return 4;
  }
}

/** แยกคำค้น (ภาษาไทยไม่มีช่องว่างคั่นคำ จึงใช้ช่องว่าง/จุลภาคที่ผู้ใช้พิมพ์เท่านั้น) */
export function searchTokens(q: string): string[] {
  return [...new Set(q.split(/[\s,]+/).map((t) => t.trim()).filter((t) => t.length >= 2))].slice(0, 6);
}

export type DocKind = 'INC' | 'REQ';
/** INC-24811 / REQ-10291 → { kind, seq } */
export function parsePortalDocNo(value: string): { kind: DocKind; seq: number } | null {
  const m = /^(INC|REQ)-(\d+)$/i.exec(decodeURIComponent(value).trim());
  return m ? { kind: m[1].toUpperCase() as DocKind, seq: Number(m[2]) } : null;
}

export function isValidScore(n: unknown): n is 1 | 2 | 3 | 4 | 5 {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5;
}

/** ปิดเมื่อวันนี้/เมื่อวาน/N วันก่อน (เทียบวันตามเวลาไทย) */
export function dayDiffBangkok(then: Date, now = new Date()): number {
  const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
  const a = Date.parse(`${ymd(now)}T00:00:00Z`);
  const b = Date.parse(`${ymd(then)}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}
