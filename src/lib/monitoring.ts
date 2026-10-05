// Monitoring and Event Management — กติกา (ฟังก์ชันบริสุทธิ์ ทดสอบได้โดยไม่ใช้ DB)

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export type EvStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

const RANK: Record<Severity, number> = { INFO: 0, WARNING: 1, CRITICAL: 2 };
export const severityRank = (s: Severity) => RANK[s];

export const MAX_BODY_BYTES = 16 * 1024;

// ── payload จากระบบมอนิเตอร์ ──
export interface IncomingEvent {
  check: string;
  /** 'OK' = กลับสู่ปกติ (ปิดเหตุการณ์ที่เปิดอยู่) */
  state: Severity | 'OK';
  ci: string | null;
  service: string | null;
  message: string | null;
  /** ใช้แยกเหตุการณ์ต่างกันของ check เดียวกัน (เช่น คนละดิสก์) — ไม่ระบุ = ใช้ check อย่างเดียว */
  key: string | null;
}

const STATES: Record<string, IncomingEvent['state']> = { ok: 'OK', info: 'INFO', warning: 'WARNING', warn: 'WARNING', critical: 'CRITICAL', crit: 'CRITICAL' };

/** ตัดอักขระควบคุมทั้งหมด (รวมขึ้นบรรทัดใหม่) และจำกัดความยาว — กันหัวข้อ/ข้อความมีตัวอักษรแปลกปลอม */
export const clean = (v: string, max: number) => v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * ตรวจและแปลง payload — ไม่เชื่อชนิดข้อมูลใด ๆ ที่มาจากภายนอก
 * ต้องเป็นออบเจ็กต์ธรรมดา: check (ข้อความ ≤ 120), severity/state (ok|info|warning|critical); ci/service/message/key ไม่บังคับ
 */
export function parseEvent(raw: unknown): { ok: true; event: IncomingEvent } | { ok: false; errors: string[] } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['payload ต้องเป็นออบเจ็กต์ JSON'] };
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];
  const str = (k: string, max: number, required = false): string | null => {
    const v = o[k];
    if (v === undefined || v === null || v === '') {
      if (required) errors.push(`ต้องระบุ ${k}`);
      return null;
    }
    if (typeof v !== 'string') {
      errors.push(`${k} ต้องเป็นข้อความ`);
      return null;
    }
    const c = clean(v, max);
    if (!c && required) errors.push(`ต้องระบุ ${k}`);
    return c || null;
  };
  const check = str('check', 120, true);
  const stateRaw = o['severity'] ?? o['state'];
  let state: IncomingEvent['state'] | undefined;
  if (typeof stateRaw === 'string') state = STATES[stateRaw.trim().toLowerCase()];
  if (!state) errors.push('severity ต้องเป็นหนึ่งใน ok, info, warning, critical');
  const ci = str('ci', 120);
  const service = str('service', 40);
  const key = str('key', 120);
  // message ยาวกว่าฟิลด์อื่น แต่ยังจำกัด (ตัดทิ้งส่วนเกินแทนปฏิเสธ — ข้อความจากเครื่องมือมักยาว)
  const message = typeof o['message'] === 'string' ? clean(o['message'], 1000) || null : null;
  if (o['message'] !== undefined && o['message'] !== null && typeof o['message'] !== 'string') errors.push('message ต้องเป็นข้อความ');
  if (errors.length || !check || !state) return { ok: false, errors };
  return { ok: true, event: { check, state, ci, service, message, key } };
}

/** กุญแจรวมเหตุการณ์ซ้ำ: CI (ที่แหล่งส่งมา) + check + key — ไม่สนตัวพิมพ์เล็กใหญ่เพื่อไม่ให้ "ERP-DB-02" กับ "erp-db-02" แตกเป็นสองรายการ */
export const dedupKey = (e: Pick<IncomingEvent, 'ci' | 'check' | 'key'>) => [e.ci ?? '', e.check, e.key ?? ''].map((x) => x.toLowerCase()).join('|');

export interface OpenEventLike {
  severity: Severity;
  status: EvStatus;
  occurrences: number;
  incidentId: string | null;
}

export type IngestDecision =
  | { action: 'ignore' } // ปกติ และไม่มีเหตุการณ์ที่เปิดอยู่ → ไม่เก็บ
  | { action: 'resolve' } // ปกติ → ปิดเหตุการณ์ที่เปิดอยู่
  | { action: 'create'; severity: Severity }
  | { action: 'update'; severity: Severity; occurrences: number; reopenStatus: EvStatus };

/**
 * ตัดสินใจเมื่อได้รับเหตุการณ์: ปกติ → ปิด/ข้าม · ผิดปกติ → สร้างใหม่หรือรวมเข้ารายการที่เปิดอยู่ (นับจำนวนครั้ง)
 * สถานะ "รับทราบ" คงไว้เมื่อรุนแรงเท่าเดิมหรือลดลง แต่กลับเป็น "เปิด" เมื่อรุนแรงขึ้น (ผู้ที่รับทราบไว้ต้องรู้ว่าแย่ลง)
 */
export function decide(open: OpenEventLike | null, incoming: IncomingEvent): IngestDecision {
  if (incoming.state === 'OK') return open ? { action: 'resolve' } : { action: 'ignore' };
  if (!open) return { action: 'create', severity: incoming.state };
  const worse = severityRank(incoming.state) > severityRank(open.severity);
  return { action: 'update', severity: incoming.state, occurrences: open.occurrences + 1, reopenStatus: worse ? 'OPEN' : open.status };
}

/** ควรสร้าง Incident อัตโนมัติหรือไม่: แหล่งเปิดใช้ + ผิดปกติ (CRITICAL) + ยังไม่เคยมี Incident จากเหตุการณ์นี้ */
export const shouldAutoIncident = (autoIncident: boolean, severity: Severity, incidentId: string | null) => autoIncident && severity === 'CRITICAL' && !incidentId;

/** ผลกระทบ/ความเร่งด่วนของ Incident จากการเฝ้าระวัง — ระบบมอนิเตอร์รู้ว่า "เสีย" แต่ไม่รู้ผลกระทบทางธุรกิจ จึงตั้งผลกระทบปานกลาง ความเร่งด่วนสูง (P2) ให้เจ้าหน้าที่ปรับต่อ */
export const INCIDENT_LEVELS = { impact: 'MED', urgency: 'HIGH' } as const;

export function incidentTitle(e: { check: string; ciRef: string | null }): string {
  return clean(`[Monitoring] ${e.check}${e.ciRef ? ` — ${e.ciRef}` : ''}`, 200);
}

// ── สุขภาพของ CI จากเหตุการณ์ที่ยังไม่ปิด ──
export type CiHealth = 'OK' | 'WARNING' | 'CRITICAL';

export interface CiEventLike {
  ciId: string | null;
  severity: Severity;
  status: EvStatus;
}

/** สุขภาพของ CI = เหตุการณ์ที่ยังไม่ปิดและยังไม่ถูก "รับทราบ" ที่รุนแรงที่สุด (INFO ไม่ทำให้สุขภาพเสีย); รับทราบแล้วยังนับเป็นเตือน/ผิดปกติ — เพียงแต่ไม่เรียกซ้ำ จึงนับตามความรุนแรงเสมอ */
export function ciHealth(events: CiEventLike[]): Map<string, CiHealth> {
  const out = new Map<string, CiHealth>();
  for (const e of events) {
    if (!e.ciId || e.status === 'RESOLVED' || e.severity === 'INFO') continue;
    const next: CiHealth = e.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
    const cur = out.get(e.ciId);
    if (!cur || (cur === 'WARNING' && next === 'CRITICAL')) out.set(e.ciId, next);
  }
  return out;
}

// ── จำกัดอัตรา (ต่อแหล่ง) ──
export const RATE_LIMIT = 300; // เหตุการณ์ต่อนาทีต่อแหล่ง
export const RATE_WINDOW_MS = 60_000;
export function allowRate(store: Map<string, { n: number; start: number }>, key: string, now = Date.now(), limit = RATE_LIMIT): boolean {
  const e = store.get(key);
  if (!e || now - e.start >= RATE_WINDOW_MS) {
    store.set(key, { n: 1, start: now });
    return true;
  }
  if (e.n >= limit) return false;
  e.n += 1;
  return true;
}

export const TOKEN_PREFIX = 'shm_';
export const looksLikeSourceToken = (t: unknown): t is string => typeof t === 'string' && /^shm_[A-Za-z0-9_-]{43}$/.test(t);

/** token จากหัว Authorization: Bearer ... (ไม่รับรูปแบบอื่น/ไม่รับใน query string — URL ถูกบันทึกใน log) */
export function bearer(header: string | null | undefined): string | null {
  const m = /^Bearer ([^\s]+)$/.exec(header ?? '');
  return m ? m[1] : null;
}
