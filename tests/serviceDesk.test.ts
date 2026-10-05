import { describe, expect, it } from 'vitest';
import { buildQueue, filterQueue, incidentRisk, parseTab, parseType, pickRule, renderMacro, tabCounts, validateMacro, validateOnBehalf, validateRule, isDeskChannel, type QueueIncident, type QueueRequest, type RuleLike } from '@/lib/serviceDesk';
import type { TimerLike } from '@/lib/sla';
import { can } from '@/lib/permissions';

const NOW = new Date('2026-10-05T05:00:00Z');
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
const timer = (leftMin: number, target = 240, over: Partial<TimerLike> = {}): TimerLike => ({
  metric: 'RESOLVE', startedAt: min(leftMin - target), dueAt: min(leftMin), targetMinutes: target, achievedAt: null, pausedAt: null, state: 'RUNNING', ...over,
});
const inc = (o: Partial<QueueIncident> & { id: string; seq: number }): QueueIncident => ({
  title: `inc ${o.seq}`, priority: 'P3', status: 'NEW', channel: null, createdAt: min(-60), assigneeId: null, assigneeName: null, reporterName: 'ผู้แจ้ง', isMajor: false, timers: [], ...o,
});
const req = (o: Partial<QueueRequest> & { id: string; seq: number }): QueueRequest => ({ title: `req ${o.seq}`, status: 'PENDING_APPROVAL', createdAt: min(-120), requesterName: 'ผู้ขอ', ...o });

describe('pickRule', () => {
  const r = (o: Partial<RuleLike> & { id: string }): RuleLike => ({ serviceId: null, groupId: 'g', assigneeId: null, active: true, sortOrder: 0, ...o });
  it('กฎตรงบริการชนะกฎค่าเริ่มต้นเสมอ แม้ค่าเริ่มต้นมีลำดับน้อยกว่า', () => {
    const rules = [r({ id: 'default', sortOrder: 0 }), r({ id: 'erp', serviceId: 'ERP', sortOrder: 9 })];
    expect(pickRule(rules, 'ERP')?.id).toBe('erp');
    expect(pickRule(rules, 'VPN')?.id).toBe('default');
    expect(pickRule(rules, null)?.id).toBe('default');
  });
  it('หลายกฎของบริการเดียวกัน ใช้ลำดับน้อยสุด; กฎที่ปิดไม่ถูกใช้; ไม่มีกฎ = null', () => {
    const rules = [r({ id: 'b', serviceId: 'S', sortOrder: 5 }), r({ id: 'a', serviceId: 'S', sortOrder: 1 }), r({ id: 'off', serviceId: 'S', sortOrder: 0, active: false })];
    expect(pickRule(rules, 'S')?.id).toBe('a');
    expect(pickRule(rules, 'X')).toBeNull();
    expect(pickRule([], 'S')).toBeNull();
    expect(rules[0].id).toBe('b'); // ไม่แก้ลำดับของ input
  });
});

describe('incidentRisk', () => {
  it('เกินกำหนด / ใกล้เกิน (เหลือ ≤ 25%) / ปกติ', () => {
    expect(incidentRisk([timer(-5)], NOW)).toBe('BREACHED');
    expect(incidentRisk([timer(50)], NOW)).toBe('NEAR'); // 50/240 = 20.8%
    expect(incidentRisk([timer(120)], NOW)).toBeNull();
    expect(incidentRisk([], NOW)).toBeNull();
  });
  it('ข้าม timer ที่จบแล้วหรือหยุดพัก; เกินกำหนดชนะใกล้เกิน', () => {
    expect(incidentRisk([timer(-5, 240, { achievedAt: min(-10) })], NOW)).toBeNull();
    expect(incidentRisk([timer(-5, 240, { pausedAt: min(-20), state: 'PAUSED' })], NOW)).toBeNull();
    expect(incidentRisk([timer(50), timer(-1)], NOW)).toBe('BREACHED');
  });
});

describe('buildQueue / filterQueue / tabCounts', () => {
  const incidents = [
    inc({ id: 'a', seq: 1, priority: 'P3', createdAt: min(-300) }),
    inc({ id: 'b', seq: 2, priority: 'P1', createdAt: min(-30), assigneeId: 'me', assigneeName: 'ฉัน', status: 'ASSIGNED' }),
    inc({ id: 'c', seq: 3, priority: 'P4', createdAt: min(-10), timers: [timer(-3)], assigneeId: 'other', assigneeName: 'คนอื่น', channel: 'โทรศัพท์' }),
    inc({ id: 'd', seq: 4, priority: 'P2', createdAt: min(-200), channel: 'อีเมล', timers: [timer(40)] }),
  ];
  const requests = [req({ id: 'r1', seq: 10010 }), req({ id: 'r2', seq: 10011, createdAt: min(-500) })];
  const items = buildQueue(incidents, requests, NOW);

  it('เรียง: เสี่ยง SLA → ความสำคัญ → คำขออยู่หลัง Incident → เก่าสุดก่อน', () => {
    expect(items.map((i) => i.docNo)).toEqual(['INC-00003', 'INC-00004', 'INC-00002', 'INC-00001', 'REQ-10011', 'REQ-10010']);
  });
  it('ธง unassigned / risk ถูกต้อง และ Request ไม่มีผู้รับผิดชอบในความหมายของคิว', () => {
    const by = Object.fromEntries(items.map((i) => [i.docNo, i]));
    expect(by['INC-00001'].unassigned).toBe(true);
    expect(by['INC-00002'].unassigned).toBe(false);
    expect(by['INC-00003'].risk).toBe('BREACHED');
    expect(by['INC-00004'].risk).toBe('NEAR');
    expect(by['REQ-10010'].unassigned).toBe(false);
    expect(by['REQ-10010'].href).toBe('/requests/REQ-10010');
  });
  it('แท็บ: ยังไม่มอบหมาย (เฉพาะ Incident) / ของฉัน / เสี่ยง SLA', () => {
    expect(filterQueue(items, { tab: 'unassigned' }).map((i) => i.id)).toEqual(['d', 'a']);
    expect(filterQueue(items, { tab: 'mine', meId: 'me' }).map((i) => i.id)).toEqual(['b']);
    expect(filterQueue(items, { tab: 'mine' })).toEqual([]); // ไม่รู้ว่าเป็นใคร = ไม่มีของฉัน (ไม่เหมาจากงานที่ไม่มีเจ้าของ)
    expect(filterQueue(items, { tab: 'risk' }).map((i) => i.id)).toEqual(['c', 'd']);
  });
  it('ตัวกรองประเภทและช่องทาง ทำงานร่วมกับแท็บ', () => {
    expect(filterQueue(items, { type: 'REQ' })).toHaveLength(2);
    expect(filterQueue(items, { type: 'INC' })).toHaveLength(4);
    expect(filterQueue(items, { channel: 'โทรศัพท์' }).map((i) => i.id)).toEqual(['c']);
    expect(filterQueue(items, { tab: 'unassigned', channel: 'อีเมล' }).map((i) => i.id)).toEqual(['d']);
    expect(filterQueue(items, { type: 'REQ', tab: 'unassigned' })).toEqual([]);
  });
  it('จำนวนต่อแท็บนับหลังกรองประเภท/ช่องทาง', () => {
    expect(tabCounts(items, { meId: 'me' })).toEqual({ all: 6, unassigned: 2, mine: 1, risk: 2 });
    expect(tabCounts(items, { type: 'INC', meId: 'me' }).all).toBe(4);
    expect(tabCounts(items, { channel: 'อีเมล', meId: 'me' })).toEqual({ all: 1, unassigned: 1, mine: 0, risk: 1 });
  });
  it('parseTab/parseType: ค่าขยะถอยเป็นค่าเริ่มต้น', () => {
    expect(parseTab('mine')).toBe('mine');
    expect(parseTab('x')).toBe('all');
    expect(parseTab(undefined)).toBe('all');
    expect(parseType('REQ')).toBe('REQ');
    expect(parseType('../')).toBe('all');
  });
});

describe('validate', () => {
  it('กฎ: ต้องมีชื่อและกลุ่ม; ลำดับเป็นจำนวนเต็ม; บริการว่างคือค่าเริ่มต้น', () => {
    expect(validateRule({ name: '', serviceId: '', groupId: '', sortOrder: '' }).errors).toHaveLength(2);
    expect(validateRule({ name: 'ERP', serviceId: 's1', groupId: 'g1', sortOrder: '3' }).clean).toEqual({ name: 'ERP', serviceId: 's1', groupId: 'g1', sortOrder: 3 });
    expect(validateRule({ name: 'x', serviceId: ' ', groupId: 'g', sortOrder: '' }).clean.serviceId).toBeNull();
    for (const bad of ['-1', '1.5', 'x', '10000']) expect(validateRule({ name: 'x', serviceId: '', groupId: 'g', sortOrder: bad }).errors.join(), bad).toContain('ลำดับ');
  });
  it('ข้อความสำเร็จรูป: ต้องมีชื่อ/เนื้อหา ความยาวจำกัด', () => {
    expect(validateMacro({ title: ' ', body: ' ', sortOrder: '' }).errors).toHaveLength(2);
    expect(validateMacro({ title: 'x'.repeat(81), body: 'b'.repeat(2001), sortOrder: '' }).errors).toHaveLength(2);
    expect(validateMacro({ title: ' ขอข้อมูลเพิ่ม ', body: ' ช่วยแนบภาพหน้าจอ ', sortOrder: '2' }).clean).toEqual({ title: 'ขอข้อมูลเพิ่ม', body: 'ช่วยแนบภาพหน้าจอ', sortOrder: 2 });
  });
  it('บันทึกแทนผู้ใช้: ต้องเลือกผู้แจ้ง ช่องทางที่รู้จัก ประเภท และหัวข้อ', () => {
    const ok = { callerId: 'u1', channel: 'โทรศัพท์', type: 'INC', title: 'เข้า ERP ไม่ได้' };
    expect(validateOnBehalf(ok)).toEqual([]);
    expect(validateOnBehalf({ ...ok, callerId: '' })).toHaveLength(1);
    expect(validateOnBehalf({ ...ok, channel: 'พอร์ทัลผู้ใช้' })).toHaveLength(1); // พอร์ทัลไม่ใช่ช่องทางที่บันทึกแทน
    expect(validateOnBehalf({ ...ok, type: 'X' })).toHaveLength(1);
    expect(validateOnBehalf({ ...ok, title: ' ' })).toHaveLength(1);
    expect(validateOnBehalf({ ...ok, title: 'x'.repeat(201) })).toHaveLength(1);
    expect(isDeskChannel('Walk-in')).toBe(true);
  });
});

describe('renderMacro', () => {
  it('แทนตัวแปรที่รู้จัก คงตัวแปรที่ไม่รู้จัก และไม่ตีความผลลัพธ์ซ้ำ', () => {
    const body = 'เรียนคุณ{{ชื่อ}} เรื่อง {{เลขที่}} โดย {{เจ้าหน้าที่}} {{ไม่รู้จัก}}';
    expect(renderMacro(body, { ชื่อ: 'สมชาย', เลขที่: 'INC-00001', เจ้าหน้าที่: 'วรรณา' })).toBe('เรียนคุณสมชาย เรื่อง INC-00001 โดย วรรณา {{ไม่รู้จัก}}');
    expect(renderMacro('{{ ชื่อ }}', { ชื่อ: '{{เลขที่}}' })).toBe('{{เลขที่}}'); // ค่าที่แทนไม่ถูกแทนซ้ำ
    expect(renderMacro('สวัสดี {{ชื่อ}}', { ชื่อ: null })).toBe('สวัสดี {{ชื่อ}}'); // ไม่มีค่า = คงไว้ ไม่เป็น "null"
  });
});

describe('สิทธิ์ servicedesk.manage', () => {
  it('หัวหน้าทีมและผู้ดูแลเท่านั้น', () => {
    for (const r of ['RESOLVER_GROUP_LEAD', 'ADMIN'] as const) expect(can(r, 'servicedesk.manage'), r).toBe(true);
    for (const r of ['AGENT', 'END_USER', 'CAB_MEMBER', 'CHANGE_MANAGER', 'CONFIG_MANAGER'] as const) expect(can(r, 'servicedesk.manage'), r).toBe(false);
  });
});
