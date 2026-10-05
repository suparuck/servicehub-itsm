import { describe, expect, it } from 'vitest';
import { absoluteUrl, appUrl, mailConfig } from '@/lib/mail/config';
import { MAX_ATTEMPTS, backoffMs, excerpt, pickRecipients, type Recipient } from '@/lib/mail/rules';
import { TEMPLATE_META, esc, oneLine, render, safeUrl, summarize, type MailMessage, type TemplateName } from '@/lib/mail/templates';
import { RESET_TTL_MS, generateToken, hashToken, looksLikeToken, tokenState } from '@/lib/mail/tokens';

describe('tokens', () => {
  it('สุ่มไม่ซ้ำ ยาว 43 ตัว และแฮชตรงกับ token', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toHaveLength(43);
    expect(looksLikeToken(a.token)).toBe(true);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.token);
  });
  it('ปฏิเสธค่าที่รูปแบบไม่ใช่ token', () => {
    for (const bad of ['', 'abc', 'x'.repeat(42), 'x'.repeat(44), `${'a'.repeat(42)}!`, undefined, null, 123, ['a']]) expect(looksLikeToken(bad)).toBe(false);
  });
  it('สถานะ: ใช้ได้ / ใช้ไปแล้ว / หมดอายุ', () => {
    const now = new Date('2026-10-04T10:00:00Z');
    const live = { expiresAt: new Date(now.getTime() + RESET_TTL_MS), usedAt: null };
    expect(tokenState(live, now)).toBe('OK');
    expect(tokenState({ ...live, usedAt: now }, now)).toBe('USED');
    expect(tokenState({ expiresAt: new Date(now.getTime() - 1), usedAt: null }, now)).toBe('EXPIRED');
    expect(tokenState({ expiresAt: now, usedAt: null }, now)).toBe('EXPIRED'); // ถึงเวลาพอดี = หมดอายุ
    expect(tokenState({ expiresAt: new Date(now.getTime() - 1), usedAt: now }, now)).toBe('USED'); // ใช้ไปแล้วมาก่อน
  });
});

describe('config', () => {
  it('appUrl: APP_URL → AUTH_URL → ค่าเริ่มต้น และตัด / ท้าย', () => {
    expect(appUrl({ APP_URL: 'https://itsm.example.com/' })).toBe('https://itsm.example.com');
    expect(appUrl({ AUTH_URL: 'https://a.example.com' })).toBe('https://a.example.com');
    expect(appUrl({ APP_URL: 'https://x.example.com', AUTH_URL: 'https://y.example.com' })).toBe('https://x.example.com');
    expect(appUrl({})).toBe('http://localhost:3000');
  });
  it('appUrl ปฏิเสธ protocol อันตรายและค่าขยะ', () => {
    expect(appUrl({ APP_URL: 'javascript:alert(1)' })).toBe('http://localhost:3000');
    expect(appUrl({ APP_URL: 'not a url' })).toBe('http://localhost:3000');
  });
  it('absoluteUrl', () => {
    expect(absoluteUrl('/reset-password?token=x', { APP_URL: 'https://h.example' })).toBe('https://h.example/reset-password?token=x');
  });
  it('mailConfig: ยังไม่ตั้ง SMTP_HOST = ไม่พร้อม; พอร์ต 465 = TLS', () => {
    expect(mailConfig({}).configured).toBe(false);
    const c = mailConfig({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465' });
    expect(c).toMatchObject({ configured: true, port: 465, secure: true });
    expect(mailConfig({ SMTP_HOST: 'h', SMTP_PORT: '587' }).secure).toBe(false);
    expect(mailConfig({ SMTP_HOST: 'h', SMTP_SECURE: 'true' }).secure).toBe(true);
  });
});

describe('retry backoff', () => {
  it('ตารางเวลา 1น → 5น → 15น → 1ชม → 6ชม → หยุด', () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffMs(n))).toEqual([60_000, 300_000, 900_000, 3_600_000, 21_600_000]);
    expect(backoffMs(6)).toBeNull();
    expect(backoffMs(99)).toBeNull();
    expect(MAX_ATTEMPTS).toBe(6);
  });
});

const user = (over: Partial<Recipient> & { id: string }): Recipient => ({
  email: `${over.id}@x.test`, name: over.id, active: true, notifyAssigned: true, notifyCritical: true, notifyMyItems: true, notifyApprovals: true, notifySla: true, notifyAssets: true, ...over,
});

describe('pickRecipients', () => {
  it('เคารพค่าตั้งรายหมวด', () => {
    const us = [user({ id: 'a' }), user({ id: 'b', notifyMyItems: false }), user({ id: 'c', notifySla: false })];
    expect(pickRecipients(us, 'myItems').map((u) => u.id)).toEqual(['a', 'c']);
    expect(pickRecipients(us, 'sla').map((u) => u.id)).toEqual(['a', 'b']);
  });
  it('ตัดบัญชีที่ปิด, ไม่มีอีเมล, ซ้ำ และผู้กระทำเอง', () => {
    const us = [user({ id: 'a' }), user({ id: 'a' }), user({ id: 'b', active: false }), user({ id: 'c', email: '' }), user({ id: 'd' })];
    expect(pickRecipients(us, 'assigned', 'd').map((u) => u.id)).toEqual(['a']);
  });
});

describe('excerpt / oneLine / esc / safeUrl', () => {
  it('excerpt ตัดความยาว', () => {
    expect(excerpt('a'.repeat(700), 100)).toHaveLength(100);
    expect(excerpt(null)).toBe('');
  });
  it('oneLine ลบขึ้นบรรทัดใหม่ (กัน header injection)', () => {
    expect(oneLine('หัวข้อ\r\nBcc: attacker@evil.test')).toBe('หัวข้อ Bcc: attacker@evil.test');
    expect(oneLine('x'.repeat(500))).toHaveLength(200);
  });
  it('esc ครบทุกตัวอักษรพิเศษ', () => {
    expect(esc(`<img src=x onerror="alert('1')">&`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;');
  });
  it('safeUrl รับเฉพาะ http(s)', () => {
    expect(safeUrl('https://a.example/x?y=1')).toBe('https://a.example/x?y=1');
    expect(() => safeUrl('javascript:alert(1)')).toThrow();
    expect(() => safeUrl('data:text/html,hi')).toThrow();
    expect(() => safeUrl('/relative')).toThrow();
  });
});

const URL_ = 'https://itsm.example.com/x?token=abc';
const samples: MailMessage[] = [
  { template: 'passwordReset', name: 'สมชาย', url: URL_, minutes: 30 },
  { template: 'passwordInvite', name: 'สมชาย', url: URL_, hours: 72 },
  { template: 'passwordResetByAdmin', name: 'สมชาย', url: URL_, hours: 24 },
  { template: 'passwordChanged', name: 'สมชาย', when: '4 ต.ค. 2569 10:00', forgotUrl: URL_ },
  { template: 'testMail', name: 'สมชาย', sentBy: 'ผู้ดูแล' },
  { template: 'incidentReceived', name: 'สมชาย', docNo: 'INC-1', title: 'เรื่อง', url: URL_ },
  { template: 'incidentAssigned', name: 'สมชาย', docNo: 'INC-1', title: 'เรื่อง', priority: 'P1 วิกฤต', service: 'ERP', url: URL_ },
  { template: 'incidentCritical', name: 'สมชาย', docNo: 'INC-1', title: 'เรื่อง', priority: 'P1 วิกฤต', major: true, url: URL_ },
  { template: 'incidentUpdateForUser', name: 'สมชาย', docNo: 'INC-1', title: 'เรื่อง', note: 'ข้อความ', url: URL_ },
  { template: 'incidentUserReplied', name: 'สมชาย', docNo: 'INC-1', title: 'เรื่อง', note: 'ข้อความ', url: URL_ },
  { template: 'incidentResolved', name: 'สมชาย', docNo: 'INC-1', title: 'เรื่อง', note: 'แก้แล้ว', url: URL_ },
  { template: 'slaNearBreach', name: 'สมชาย', docNo: 'INC-1', title: 'เรื่อง', priority: 'P1 วิกฤต', left: '0:30 ชม.', url: URL_ },
  { template: 'slaBreached', name: 'สมชาย', docNo: 'INC-1', title: 'เรื่อง', priority: 'P1 วิกฤต', overrun: '12 นาที', url: URL_ },
  { template: 'assetExpiring', name: 'สมชาย', tag: 'ASSET-NET-0121', assetName: 'SW-DC1-CORE01', kind: 'support', expires: '05/12/69', days: 60, url: URL_ },
  { template: 'licenseOverUse', name: 'สมชาย', tag: 'ASSET-LIC-0101', assetName: 'Adobe Creative Cloud', used: 52, qty: 50, url: URL_ },
  { template: 'releaseStatus', name: 'สมชาย', docNo: 'REL-0007', releaseName: 'Release 2026.10', event: 'ROLLED_BACK', reason: 'พบข้อผิดพลาด\nหลังอัปเกรด', window: '7 ต.ค. 01:00–03:00 น.', changes: 2, url: URL_ },
  { template: 'releaseOwner', name: 'สมชาย', docNo: 'REL-0007', releaseName: 'Release 2026.10', url: URL_ },
  { template: 'changeApprovalRequest', name: 'สมชาย', docNo: 'CHG-1', title: 'เรื่อง', type: 'Normal Change', board: 'CAB', window: '5 ต.ค. 01:00', url: URL_ },
  { template: 'changeDecision', name: 'สมชาย', docNo: 'CHG-1', title: 'เรื่อง', approved: false, comment: 'ชนช่วงปิดงวด', url: URL_ },
  { template: 'requestApprovalNeeded', name: 'สมชาย', docNo: 'REQ-1', title: 'เรื่อง', requester: 'มณีรัตน์', url: URL_ },
  { template: 'requestStatus', name: 'สมชาย', docNo: 'REQ-1', title: 'เรื่อง', state: 'DELIVERED', url: URL_ },
];

describe('templates', () => {
  it('ทุกเทมเพลตมีตัวอย่างทดสอบและมี meta', () => {
    const names = Object.keys(TEMPLATE_META) as TemplateName[];
    expect(samples.map((s) => s.template).sort()).toEqual([...names].sort());
  });
  it.each(samples.map((s) => [s.template, s] as const))('%s: subject บรรทัดเดียว, text มีลิงก์, HTML สมบูรณ์', (_name, msg) => {
    const r = render(msg);
    expect(r.subject.length).toBeGreaterThan(5);
    expect(r.subject).not.toMatch(/[\r\n]/);
    expect(r.text).toContain('สมชาย');
    if ('url' in msg) expect(r.text).toContain(URL_);
    expect(r.html).toContain('<html lang="th">');
    if ('url' in msg) expect(r.html).toContain(`href="${URL_}"`);
  });
  it('อีเมลความปลอดภัยไม่อ้างว่าปรับค่าตั้งได้ ส่วนอีเมลทั่วไปบอกที่ปรับ', () => {
    expect(render(samples[0]).text).toContain('ไม่สามารถปิดการรับได้');
    expect(render(samples[6], 'https://itsm.example.com/account').text).toContain('https://itsm.example.com/account');
  });
  it('escape ข้อมูลผู้ใช้ใน HTML (หัวข้อ Incident ที่เป็น XSS)', () => {
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const r = render({ template: 'incidentAssigned', name: evil, docNo: 'INC-1', title: evil, priority: 'P1', service: evil, url: URL_ });
    expect(r.html).not.toContain('<script>');
    expect(r.html).not.toContain('<img src=x');
    expect(r.html).toContain('&lt;script&gt;');
    const q = render({ template: 'incidentUpdateForUser', name: 'ก', docNo: 'INC-1', title: 'ข', note: evil, url: URL_ });
    expect(q.html).not.toContain('<script>');
  });
  it('ลิงก์อันตรายถูกปฏิเสธ ไม่ถูกใส่ลงอีเมล', () => {
    expect(() => render({ template: 'passwordReset', name: 'ก', url: 'javascript:alert(1)', minutes: 30 })).toThrow();
  });
  it('subject ที่มี CRLF ถูกบีบเป็นบรรทัดเดียว', () => {
    const r = render({ template: 'incidentAssigned', name: 'ก', docNo: 'INC-1', title: 'เรื่อง\r\nBcc: x@evil.test', priority: 'P1', url: URL_ });
    expect(r.subject).not.toMatch(/[\r\n]/);
  });
  it('หมวดการแจ้งเตือนผูกกับเทมเพลตถูกต้อง', () => {
    expect(TEMPLATE_META.slaBreached).toEqual({ critical: false, category: 'sla' });
    expect(TEMPLATE_META.releaseStatus).toEqual({ critical: false, category: 'myItems' });
    expect(TEMPLATE_META.releaseOwner).toEqual({ critical: false, category: 'assigned' });
    expect(TEMPLATE_META.assetExpiring).toEqual({ critical: false, category: 'assets' });
    expect(TEMPLATE_META.licenseOverUse).toEqual({ critical: false, category: 'assets' });
    expect(TEMPLATE_META.passwordReset).toEqual({ critical: true });
    expect(TEMPLATE_META.incidentUserReplied).toEqual({ critical: false, category: 'assigned' });
  });
});

describe('summarize (แจ้งเตือนในระบบ)', () => {
  it('ลิงก์เป็นพาธภายใน ไม่มี origin และใช้หัวข้อเดียวกับอีเมล', () => {
    const m: MailMessage = { template: 'incidentCritical', name: 'ก', docNo: 'INC-00001', title: 'ERP ล่ม', priority: 'P1 วิกฤต', major: false, url: 'https://itsm.example.com/incidents/INC-00001?x=1' };
    const s = summarize(m);
    expect(s.href).toBe('/incidents/INC-00001?x=1');
    expect(s.title).toBe(render(m).subject);
    expect(s.title).not.toMatch(/[\r\n]/);
    expect(s.body.length).toBeLessThanOrEqual(280);
  });
  it('ลิงก์อันตรายถูกปฏิเสธ', () => {
    expect(() => summarize({ template: 'incidentReceived', name: 'ก', docNo: 'INC-1', title: 'ข', url: 'javascript:alert(1)' })).toThrow();
  });
  it('ข้อความผู้ใช้ไม่ถูก escape ซ้ำ (React escape ตอนแสดง) แต่ไม่มีแท็ก HTML ที่เราเติม', () => {
    const s = summarize({ template: 'incidentUpdateForUser', name: 'ก', docNo: 'INC-1', title: 'ข', note: '<b>x</b>', url: URL_ });
    expect(s.body).toBe('<b>x</b>');
  });
});
