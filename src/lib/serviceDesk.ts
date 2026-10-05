// Service Desk — คิวรวม Incident + Service Request, กฎมอบหมาย, ข้อความสำเร็จรูป (ฟังก์ชันบริสุทธิ์ ทดสอบได้โดยไม่ใช้ DB)
import { formatDocNo } from './docno';
import { timerView, type TimerLike } from './sla';

/** ช่องทางที่ผู้ใช้ติดต่อเข้ามา (เก็บใน Incident.channel เป็นข้อความ) */
export const DESK_CHANNELS = ['โทรศัพท์', 'อีเมล', 'Walk-in', 'แชต'] as const;
export type DeskChannel = (typeof DESK_CHANNELS)[number];
export const isDeskChannel = (v: string): v is DeskChannel => (DESK_CHANNELS as readonly string[]).includes(v);

// ── กฎมอบหมายอัตโนมัติ ──
export interface RuleLike {
  id: string;
  serviceId: string | null;
  groupId: string;
  assigneeId: string | null;
  active: boolean;
  sortOrder: number;
}

/**
 * เลือกกฎสำหรับบริการหนึ่ง: กฎที่ตรงบริการ (เรียงตามลำดับ) มาก่อน; ไม่มีก็ใช้กฎค่าเริ่มต้น (ไม่ระบุบริการ); ไม่มีเลย = null
 * กฎที่ปิดอยู่ไม่ถูกใช้ — กฎเฉพาะบริการชนะกฎค่าเริ่มต้นเสมอ แม้ค่าเริ่มต้นจะมีลำดับเลขน้อยกว่า
 */
export function pickRule<T extends RuleLike>(rules: T[], serviceId: string | null | undefined): T | null {
  const live = rules.filter((r) => r.active).sort((a, b) => a.sortOrder - b.sortOrder);
  return (serviceId ? live.find((r) => r.serviceId === serviceId) : undefined) ?? live.find((r) => r.serviceId === null) ?? null;
}

// ── คิวรวม ──
export type QueueTab = 'all' | 'unassigned' | 'mine' | 'risk';
export type QueueType = 'all' | 'INC' | 'REQ';
export type Risk = 'BREACHED' | 'NEAR' | null;

export interface QueueIncident {
  id: string;
  seq: number;
  title: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  status: string;
  channel: string | null;
  createdAt: Date;
  assigneeId: string | null;
  assigneeName: string | null;
  reporterName: string | null;
  isMajor: boolean;
  timers: TimerLike[];
}

export interface QueueRequest {
  id: string;
  seq: number;
  title: string;
  status: string;
  createdAt: Date;
  requesterName: string | null;
}

export interface QueueItem {
  key: string;
  kind: 'INC' | 'REQ';
  id: string;
  docNo: string;
  href: string;
  title: string;
  who: string | null;
  channel: string | null;
  priority: 'P1' | 'P2' | 'P3' | 'P4' | null;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: Date;
  unassigned: boolean;
  risk: Risk;
  isMajor: boolean;
}

/** ความเสี่ยง SLA ของ Incident: เกินกำหนดแล้ว / ใกล้เกิน (เหลือ ≤ 25%) — ดูเฉพาะ timer ที่ยังไม่จบและไม่ได้หยุดพัก */
export function incidentRisk(timers: TimerLike[], now: Date): Risk {
  let worst: Risk = null;
  for (const t of timers) {
    if (t.achievedAt || t.pausedAt) continue;
    const v = timerView(t, now);
    if (v.state === 'BREACHED') return 'BREACHED';
    if (v.near) worst = 'NEAR';
  }
  return worst;
}

const PRIORITY_RANK = { P1: 1, P2: 2, P3: 3, P4: 4 } as const;
const RISK_RANK = { BREACHED: 0, NEAR: 1 } as const;

export function buildQueue(incidents: QueueIncident[], requests: QueueRequest[], now = new Date()): QueueItem[] {
  const items: QueueItem[] = [
    ...incidents.map<QueueItem>((i) => ({
      key: `inc-${i.id}`, kind: 'INC', id: i.id, docNo: formatDocNo('INC', i.seq), href: `/incidents/${formatDocNo('INC', i.seq)}`, title: i.title, who: i.reporterName,
      channel: i.channel, priority: i.priority, status: i.status, assigneeId: i.assigneeId, assigneeName: i.assigneeName, createdAt: i.createdAt, unassigned: !i.assigneeId,
      risk: incidentRisk(i.timers, now), isMajor: i.isMajor,
    })),
    ...requests.map<QueueItem>((r) => ({
      key: `req-${r.id}`, kind: 'REQ', id: r.id, docNo: formatDocNo('REQ', r.seq), href: `/requests/${formatDocNo('REQ', r.seq)}`, title: r.title, who: r.requesterName,
      channel: null, priority: null, status: r.status, assigneeId: null, assigneeName: null, createdAt: r.createdAt, unassigned: false, risk: null, isMajor: false,
    })),
  ];
  // เสี่ยง SLA ก่อน → ความสำคัญ (Incident ก่อนคำขอ) → เก่าสุดก่อน (รอนานสุดมาก่อน)
  return items.sort((a, b) =>
    (a.risk ? RISK_RANK[a.risk] : 2) - (b.risk ? RISK_RANK[b.risk] : 2) ||
    (a.priority ? PRIORITY_RANK[a.priority] : 5) - (b.priority ? PRIORITY_RANK[b.priority] : 5) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.docNo.localeCompare(b.docNo));
}

export interface QueueFilter {
  tab?: QueueTab;
  type?: QueueType;
  channel?: string;
  meId?: string;
}

export function filterQueue(items: QueueItem[], f: QueueFilter): QueueItem[] {
  return items.filter((i) => {
    if (f.type === 'INC' && i.kind !== 'INC') return false;
    if (f.type === 'REQ' && i.kind !== 'REQ') return false;
    if (f.channel && i.channel !== f.channel) return false;
    if (f.tab === 'unassigned') return i.kind === 'INC' && i.unassigned;
    if (f.tab === 'mine') return i.kind === 'INC' && !!f.meId && i.assigneeId === f.meId;
    if (f.tab === 'risk') return i.risk !== null;
    return true;
  });
}

/** จำนวนในแต่ละแท็บ (นับหลังกรองประเภท/ช่องทาง เพื่อให้ตัวเลขตรงกับสิ่งที่จะเห็นเมื่อกด) */
export function tabCounts(items: QueueItem[], f: Omit<QueueFilter, 'tab'>): Record<QueueTab, number> {
  return { all: filterQueue(items, { ...f, tab: 'all' }).length, unassigned: filterQueue(items, { ...f, tab: 'unassigned' }).length, mine: filterQueue(items, { ...f, tab: 'mine' }).length, risk: filterQueue(items, { ...f, tab: 'risk' }).length };
}

export const parseTab = (v: string | undefined): QueueTab => (v === 'unassigned' || v === 'mine' || v === 'risk' ? v : 'all');
export const parseType = (v: string | undefined): QueueType => (v === 'INC' || v === 'REQ' ? v : 'all');

// ── ตรวจข้อมูล ──
export function validateRule(i: { name: string; serviceId: string; groupId: string; sortOrder: string }): { errors: string[]; clean: { name: string; serviceId: string | null; groupId: string; sortOrder: number } } {
  const errors: string[] = [];
  const name = i.name.trim();
  if (!name) errors.push('กรุณาระบุชื่อกฎ');
  if (name.length > 100) errors.push('ชื่อกฎยาวเกิน 100 ตัวอักษร');
  if (!i.groupId.trim()) errors.push('กรุณาเลือกกลุ่มผู้รับผิดชอบ');
  const so = i.sortOrder.trim() === '' ? 0 : Number(i.sortOrder);
  if (!Number.isInteger(so) || so < 0 || so > 9999) errors.push('ลำดับต้องเป็นจำนวนเต็ม 0–9999');
  return { errors, clean: { name, serviceId: i.serviceId.trim() || null, groupId: i.groupId.trim(), sortOrder: Number.isInteger(so) ? so : 0 } };
}

export function validateMacro(i: { title: string; body: string; sortOrder: string }): { errors: string[]; clean: { title: string; body: string; sortOrder: number } } {
  const errors: string[] = [];
  const title = i.title.trim();
  const body = i.body.trim();
  if (!title) errors.push('กรุณาระบุชื่อข้อความ');
  if (title.length > 80) errors.push('ชื่อข้อความยาวเกิน 80 ตัวอักษร');
  if (!body) errors.push('กรุณาระบุเนื้อหา');
  if (body.length > 2000) errors.push('เนื้อหายาวเกิน 2,000 ตัวอักษร');
  const so = i.sortOrder.trim() === '' ? 0 : Number(i.sortOrder);
  if (!Number.isInteger(so) || so < 0 || so > 9999) errors.push('ลำดับต้องเป็นจำนวนเต็ม 0–9999');
  return { errors, clean: { title, body, sortOrder: Number.isInteger(so) ? so : 0 } };
}

/**
 * แทนที่ตัวแปรในข้อความสำเร็จรูป: {{ชื่อ}} = ชื่อผู้แจ้ง, {{เลขที่}} = เลขที่ Incident, {{เจ้าหน้าที่}} = ชื่อผู้ตอบ
 * ตัวแปรที่ไม่รู้จักคงไว้ตามเดิม (ไม่หายเงียบ ๆ) — ค่าที่แทนเป็นข้อความธรรมดา ไม่ตีความต่อ
 */
export function renderMacro(body: string, vars: { ชื่อ?: string | null; เลขที่?: string; เจ้าหน้าที่?: string | null }): string {
  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, k: string) => {
    const v = (vars as Record<string, string | null | undefined>)[k];
    return v == null ? m : v;
  });
}

/** ผู้แจ้งที่ Service Desk บันทึกแทน: ต้องเลือกจากผู้ใช้ในระบบ (เพื่อให้ผู้ใช้เห็นเรื่องในพอร์ทัลและได้รับแจ้งเตือน) */
export function validateOnBehalf(i: { callerId: string; channel: string; type: string; title: string }): string[] {
  const errors: string[] = [];
  if (!i.callerId.trim()) errors.push('กรุณาเลือกผู้แจ้ง');
  if (!isDeskChannel(i.channel)) errors.push('กรุณาเลือกช่องทางที่ผู้ใช้ติดต่อเข้ามา');
  if (i.type !== 'INC' && i.type !== 'REQ') errors.push('กรุณาเลือกประเภท (แจ้งปัญหา/ขอบริการ)');
  const t = i.title.trim();
  if (!t) errors.push('กรุณาระบุหัวข้อ');
  if (t.length > 200) errors.push('หัวข้อยาวเกิน 200 ตัวอักษร');
  return errors;
}
