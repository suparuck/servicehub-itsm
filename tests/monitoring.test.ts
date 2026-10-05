import { describe, expect, it } from 'vitest';
import { allowRate, bearer, ciHealth, serviceHealthFrom, clean, decide, dedupKey, incidentTitle, looksLikeSourceToken, parseEvent, shouldAutoIncident, type IncomingEvent, type OpenEventLike } from '@/lib/monitoring';
import { can } from '@/lib/permissions';
import { generateToken } from '@/lib/mail/tokens';

const ev = (o: Partial<IncomingEvent> = {}): IncomingEvent => ({ check: 'disk_full', state: 'CRITICAL', ci: 'ERP-DB-02', service: null, message: null, key: null, ...o });

describe('parseEvent', () => {
  it('payload ที่ถูกต้อง: normalize ชื่อระดับและตัดช่องว่าง', () => {
    const r = parseEvent({ check: '  disk_full ', severity: 'Critical', ci: 'ERP-DB-02', service: 'ERP', message: 'ดิสก์เต็ม 98%', key: '/data' });
    expect(r).toEqual({ ok: true, event: { check: 'disk_full', state: 'CRITICAL', ci: 'ERP-DB-02', service: 'ERP', message: 'ดิสก์เต็ม 98%', key: '/data' } });
  });
  it('รับ state เป็นชื่อฟิลด์แทน severity และ alias warn/crit/ok', () => {
    expect(parseEvent({ check: 'c', state: 'ok' })).toMatchObject({ ok: true, event: { state: 'OK' } });
    expect(parseEvent({ check: 'c', severity: 'warn' })).toMatchObject({ ok: true, event: { state: 'WARNING' } });
    expect(parseEvent({ check: 'c', severity: 'CRIT' })).toMatchObject({ ok: true, event: { state: 'CRITICAL' } });
  });
  it('ปฏิเสธสิ่งที่ไม่ใช่ออบเจ็กต์ และข้อมูลที่ขาด/ผิดชนิด (ไม่เชื่อชนิดจากภายนอก)', () => {
    for (const bad of [null, undefined, 'x', 5, [], true]) expect(parseEvent(bad).ok, String(bad)).toBe(false);
    expect(parseEvent({}).ok).toBe(false);
    expect(parseEvent({ check: 'c' }).ok).toBe(false); // ไม่มี severity
    expect(parseEvent({ check: 'c', severity: 'fatal' }).ok).toBe(false);
    expect(parseEvent({ check: 123, severity: 'ok' }).ok).toBe(false);
    expect(parseEvent({ check: '  ', severity: 'ok' }).ok).toBe(false);
    expect(parseEvent({ check: 'c', severity: 'ok', ci: { $ne: 1 } }).ok).toBe(false);
    expect(parseEvent({ check: 'c', severity: 'ok', message: 5 }).ok).toBe(false);
    expect(parseEvent({ check: 'c', severity: ['critical'] }).ok).toBe(false);
  });
  it('ตัดอักขระควบคุม/ขึ้นบรรทัดใหม่ และจำกัดความยาว', () => {
    const r = parseEvent({ check: 'a\r\nBcc: x\u0000', severity: 'info', message: 'x'.repeat(5000) });
    expect(r.ok && r.event.check).toBe('a Bcc: x');
    expect(r.ok && r.event.message?.length).toBe(1000);
    expect(parseEvent({ check: 'c'.repeat(500), severity: 'info' })).toMatchObject({ ok: true, event: { check: 'c'.repeat(120) } });
    expect(clean(' a \tb', 10)).toBe('a b');
  });
  it('prototype pollution: คีย์อันตรายไม่มีผล', () => {
    const r = parseEvent(JSON.parse('{"check":"c","severity":"info","__proto__":{"admin":true},"constructor":{"x":1}}'));
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
  });
});

describe('dedupKey', () => {
  it('ไม่สนตัวพิมพ์ และแยกด้วย key', () => {
    expect(dedupKey(ev({ ci: 'ERP-DB-02' }))).toBe(dedupKey(ev({ ci: 'erp-db-02', check: 'DISK_FULL' })));
    expect(dedupKey(ev({ key: '/data' }))).not.toBe(dedupKey(ev({ key: '/log' })));
    expect(dedupKey(ev({ ci: null }))).toBe('|disk_full|');
  });
});

describe('decide', () => {
  const open = (o: Partial<OpenEventLike> = {}): OpenEventLike => ({ severity: 'WARNING', status: 'OPEN', occurrences: 3, incidentId: null, ...o });
  it('ปกติ: ปิดถ้ามีเหตุการณ์เปิดอยู่ ไม่งั้นข้าม (ไม่เก็บ OK ที่ไม่มีเหตุ)', () => {
    expect(decide(open(), ev({ state: 'OK' }))).toEqual({ action: 'resolve' });
    expect(decide(null, ev({ state: 'OK' }))).toEqual({ action: 'ignore' });
  });
  it('ผิดปกติและยังไม่มีเหตุการณ์เปิด: สร้างใหม่', () => {
    expect(decide(null, ev({ state: 'WARNING' }))).toEqual({ action: 'create', severity: 'WARNING' });
  });
  it('ซ้ำ: รวมเป็นรายการเดียวและนับจำนวนครั้ง', () => {
    expect(decide(open(), ev({ state: 'WARNING' }))).toEqual({ action: 'update', severity: 'WARNING', occurrences: 4, reopenStatus: 'OPEN' });
  });
  it('รับทราบแล้ว: คงสถานะถ้ารุนแรงเท่าเดิมหรือลดลง แต่กลับเป็นเปิดเมื่อรุนแรงขึ้น', () => {
    const acked = open({ status: 'ACKNOWLEDGED', severity: 'WARNING' });
    expect(decide(acked, ev({ state: 'WARNING' }))).toMatchObject({ reopenStatus: 'ACKNOWLEDGED' });
    expect(decide(acked, ev({ state: 'INFO' }))).toMatchObject({ reopenStatus: 'ACKNOWLEDGED', severity: 'INFO' });
    expect(decide(acked, ev({ state: 'CRITICAL' }))).toMatchObject({ reopenStatus: 'OPEN', severity: 'CRITICAL' });
  });
});

describe('Incident อัตโนมัติ', () => {
  it('เฉพาะ CRITICAL, แหล่งเปิดใช้, และยังไม่มี Incident', () => {
    expect(shouldAutoIncident(true, 'CRITICAL', null)).toBe(true);
    expect(shouldAutoIncident(true, 'WARNING', null)).toBe(false);
    expect(shouldAutoIncident(false, 'CRITICAL', null)).toBe(false);
    expect(shouldAutoIncident(true, 'CRITICAL', 'inc1')).toBe(false);
  });
  it('หัวข้อบรรทัดเดียว ไม่เกิน 200 ตัว', () => {
    expect(incidentTitle({ check: 'disk_full', ciRef: 'ERP-DB-02' })).toBe('[Monitoring] disk_full — ERP-DB-02');
    expect(incidentTitle({ check: 'disk_full', ciRef: null })).toBe('[Monitoring] disk_full');
    expect(incidentTitle({ check: 'x'.repeat(300), ciRef: 'y' })).toHaveLength(200);
    expect(incidentTitle({ check: 'a\nb', ciRef: null })).not.toMatch(/\n/);
  });
});

describe('ciHealth', () => {
  it('เลือกความรุนแรงสูงสุดต่อ CI; INFO และที่ปิดแล้วไม่ทำให้เสีย; ไม่มี CI ข้าม', () => {
    const m = ciHealth([
      { ciId: 'a', severity: 'WARNING', status: 'OPEN' },
      { ciId: 'a', severity: 'CRITICAL', status: 'ACKNOWLEDGED' },
      { ciId: 'b', severity: 'INFO', status: 'OPEN' },
      { ciId: 'c', severity: 'CRITICAL', status: 'RESOLVED' },
      { ciId: null, severity: 'CRITICAL', status: 'OPEN' },
      { ciId: 'd', severity: 'WARNING', status: 'OPEN' },
    ]);
    expect(Object.fromEntries(m)).toEqual({ a: 'CRITICAL', d: 'WARNING' });
  });
});

describe('serviceHealthFrom (สุขภาพบริการจากเหตุการณ์)', () => {
  const e = (severity: 'INFO' | 'WARNING' | 'CRITICAL', status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' = 'OPEN') => ({ severity, status });
  it('ไม่มีเหตุการณ์ค้าง = ปกติ; INFO และที่ปิดแล้วไม่มีผล', () => {
    expect(serviceHealthFrom([])).toBe('OK');
    expect(serviceHealthFrom([e('INFO')])).toBe('OK');
    expect(serviceHealthFrom([e('CRITICAL', 'RESOLVED'), e('WARNING', 'RESOLVED')])).toBe('OK');
  });
  it('เตือน = ช้า/บางส่วน; ผิดปกติ = ขัดข้อง และผิดปกติชนะเตือนไม่ว่าลำดับ', () => {
    expect(serviceHealthFrom([e('WARNING')])).toBe('DEGRADED');
    expect(serviceHealthFrom([e('WARNING'), e('CRITICAL')])).toBe('DOWN');
    expect(serviceHealthFrom([e('CRITICAL'), e('WARNING')])).toBe('DOWN');
  });
  it('รับทราบแล้วยังนับ (ปัญหายังอยู่) แต่ปิดแล้วไม่นับ', () => {
    expect(serviceHealthFrom([e('CRITICAL', 'ACKNOWLEDGED')])).toBe('DOWN');
    expect(serviceHealthFrom([e('CRITICAL', 'RESOLVED'), e('WARNING', 'ACKNOWLEDGED')])).toBe('DEGRADED');
  });
});

describe('allowRate', () => {
  it('จำกัดต่อหน้าต่างเวลา แล้วเริ่มนับใหม่ และแยกตามแหล่ง', () => {
    const store = new Map<string, { n: number; start: number }>();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(allowRate(store, 's1', t0, 3)).toBe(true);
    expect(allowRate(store, 's1', t0 + 1000, 3)).toBe(false);
    expect(allowRate(store, 's2', t0 + 1000, 3)).toBe(true);
    expect(allowRate(store, 's1', t0 + 60_001, 3)).toBe(true);
  });
});

describe('token / Authorization', () => {
  it('รูปแบบ token ของแหล่ง', () => {
    const t = `shm_${generateToken().token}`;
    expect(looksLikeSourceToken(t)).toBe(true);
    for (const bad of ['', 'shm_short', `x_${generateToken().token}`, `shm_${generateToken().token}!`, undefined, null, 5]) expect(looksLikeSourceToken(bad), String(bad)).toBe(false);
  });
  it('bearer: รับเฉพาะ "Bearer <token>" รูปแบบเดียว', () => {
    expect(bearer('Bearer abc')).toBe('abc');
    for (const bad of [null, undefined, '', 'bearer abc', 'Basic abc', 'Bearer', 'Bearer a b', 'Bearer  abc']) expect(bearer(bad as string), String(bad)).toBeNull();
  });
});

describe('สิทธิ์ monitoring.admin', () => {
  it('ผู้ดูแลและผู้จัดการ CMDB เท่านั้น', () => {
    for (const r of ['ADMIN', 'CONFIG_MANAGER'] as const) expect(can(r, 'monitoring.admin'), r).toBe(true);
    for (const r of ['AGENT', 'RESOLVER_GROUP_LEAD', 'END_USER', 'CAB_MEMBER'] as const) expect(can(r, 'monitoring.admin'), r).toBe(false);
  });
});
