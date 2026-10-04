// ปฏิทินรวม Change & Problem — ฟังก์ชันบริสุทธิ์ (ไม่แตะ DB) เพื่อทดสอบได้
import { bangkokYmd, findConflicts, isClosed, type ChangeStatus, type ChangeType, type Windowed } from './change';
import { formatDocNo } from './docno';

export type CalendarKind = 'CHANGE' | 'PROBLEM';

export interface ChangeRow {
  id: string;
  seq: number;
  title: string;
  type: ChangeType;
  status: ChangeStatus;
  windowStart: Date;
  windowEnd: Date | null;
  serviceId: string | null;
  ciIds: string[];
}

export interface ProblemRow {
  id: string;
  seq: number;
  title: string;
  phase: string;
  targetDate: Date | null;
  resolvedAt: Date | null;
}

export interface CalendarEvent {
  key: string;
  kind: CalendarKind;
  docNo: string;
  title: string;
  href: string;
  start: Date;
  end: Date | null;
  /** ชนิดของ Change หรือสถานะเหตุการณ์ของ Problem — ใช้เลือกสีและข้อความกำกับ */
  tag: 'STANDARD' | 'NORMAL' | 'EMERGENCY' | 'PROBLEM_DUE' | 'PROBLEM_OVERDUE' | 'PROBLEM_RESOLVED';
  status: string;
  /** Change ที่ทับช่วงเวลากับ Change อื่นที่แตะ CI/บริการเดียวกัน (ดู findConflicts) */
  conflictWith: string[];
  /** Problem ที่เลยกำหนดแก้ไข/ทบทวนแล้วแต่ยังไม่ปิด */
  overdue: boolean;
}

/** Change ที่ยังไม่ปิดและทับช่วงกัน → map id → เลขที่เอกสารของคู่ที่ชน */
export function conflictMap(changes: ChangeRow[]): Map<string, string[]> {
  const w = (c: ChangeRow): Windowed & { seq: number } => ({ id: c.id, windowStart: c.windowStart, windowEnd: c.windowEnd, serviceId: c.serviceId, ciIds: c.ciIds, status: c.status, seq: c.seq });
  const all = changes.map(w);
  const out = new Map<string, string[]>();
  for (const c of all) {
    if (c.status && isClosed(c.status)) continue;
    const hits = findConflicts(c, all).map((f) => formatDocNo('CHG', f.change.seq));
    if (hits.length) out.set(c.id, hits);
  }
  return out;
}

export function buildEvents(changes: ChangeRow[], problems: ProblemRow[], now = new Date()): CalendarEvent[] {
  const conflicts = conflictMap(changes);
  const events: CalendarEvent[] = changes.map((c) => ({
    key: `chg-${c.id}`, kind: 'CHANGE', docNo: formatDocNo('CHG', c.seq), title: c.title, href: `/changes/${formatDocNo('CHG', c.seq)}`,
    start: c.windowStart, end: c.windowEnd, tag: c.type, status: c.status, conflictWith: conflicts.get(c.id) ?? [], overdue: false,
  }));
  const today = bangkokYmd(now);
  for (const p of problems) {
    const docNo = formatDocNo('PRB', p.seq);
    const href = `/problems/${docNo}`;
    if (p.resolvedAt) {
      events.push({ key: `prb-done-${p.id}`, kind: 'PROBLEM', docNo, title: p.title, href, start: p.resolvedAt, end: null, tag: 'PROBLEM_RESOLVED', status: p.phase, conflictWith: [], overdue: false });
    } else if (p.targetDate) {
      const overdue = bangkokYmd(p.targetDate) < today;
      events.push({ key: `prb-due-${p.id}`, kind: 'PROBLEM', docNo, title: p.title, href, start: p.targetDate, end: null, tag: overdue ? 'PROBLEM_OVERDUE' : 'PROBLEM_DUE', status: p.phase, conflictWith: [], overdue });
    }
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime() || a.docNo.localeCompare(b.docNo));
}

export function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const m = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = bangkokYmd(e.start);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return m;
}

/** ตัวกรองชนิดจาก query (?show=change,problem) — ไม่ระบุ/ไม่ถูกต้อง = แสดงทั้งสองชนิด */
export function parseShow(v: string | undefined): { change: boolean; problem: boolean } {
  const parts = new Set((v ?? '').split(',').map((s) => s.trim()));
  const change = parts.has('change');
  const problem = parts.has('problem');
  return change || problem ? { change, problem } : { change: true, problem: true };
}

// ── iCalendar (RFC 5545) ───────────────────────────────────
const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const nextDay = (ymd: string) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

/** พับบรรทัดไม่เกิน 75 octet ตามมาตรฐาน (ไม่ตัดกลางอักขระ UTF-8) */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // บรรทัดต่อมีช่องว่างนำหน้า 1 octet
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const TAG_LABEL: Record<CalendarEvent['tag'], string> = {
  STANDARD: 'Standard Change', NORMAL: 'Normal Change', EMERGENCY: 'Emergency Change',
  PROBLEM_DUE: 'กำหนดแก้ไข/ทบทวน Problem', PROBLEM_OVERDUE: 'Problem เลยกำหนด', PROBLEM_RESOLVED: 'Problem แก้ไขแล้ว',
};

/** สร้างไฟล์ .ics — Change เป็นช่วงเวลา, Problem เป็นกิจกรรมทั้งวัน; ลิงก์ใช้ baseUrl ที่ผู้ดูแลตั้ง */
export function toIcs(events: CalendarEvent[], baseUrl: string, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ServiceHub//Change and Problem Calendar//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:ServiceHub Change & Problem'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.key}@servicehub`, `DTSTAMP:${icsUtc(now)}`);
    if (e.kind === 'CHANGE') {
      const end = e.end ?? new Date(e.start.getTime() + 3_600_000);
      lines.push(`DTSTART:${icsUtc(e.start)}`, `DTEND:${icsUtc(end)}`);
    } else {
      const ymd = bangkokYmd(e.start);
      lines.push(`DTSTART;VALUE=DATE:${ymd.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nextDay(ymd)}`);
    }
    const flags = [e.conflictWith.length ? `ชนกับ ${e.conflictWith.join(', ')}` : '', e.overdue ? 'เลยกำหนด' : ''].filter(Boolean).join(' · ');
    lines.push(
      `SUMMARY:${icsEscape(`${e.docNo} ${e.title}`)}`,
      `DESCRIPTION:${icsEscape(`${TAG_LABEL[e.tag]} · สถานะ ${e.status}${flags ? ` · ${flags}` : ''}`)}`,
      `URL:${baseUrl.replace(/\/+$/, '')}${e.href}`,
      `CATEGORIES:${e.kind === 'CHANGE' ? 'Change' : 'Problem'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
