// เทมเพลตอีเมล (ฟังก์ชันบริสุทธิ์ — ไม่แตะ DB/เครือข่าย)
// ทุกเทมเพลตสร้างจากโครงสร้างเดียว (Doc) แล้ว render เป็น text และ HTML เพื่อให้สองแบบตรงกัน
// ข้อมูลที่ผู้ใช้พิมพ์ (เช่น หัวข้อ Incident) ถูก escape ทุกครั้งในจุดเดียว (esc) กัน HTML injection ในอีเมลของเจ้าหน้าที่

export type NotifyCategory = 'assigned' | 'critical' | 'myItems' | 'approvals' | 'sla';

export type MailMessage =
  // ── ความปลอดภัยของบัญชี (critical = ปิดรับไม่ได้) ──
  | { template: 'passwordReset'; name: string; url: string; minutes: number }
  | { template: 'passwordInvite'; name: string; url: string; hours: number }
  | { template: 'passwordResetByAdmin'; name: string; url: string; hours: number }
  | { template: 'passwordChanged'; name: string; when: string; forgotUrl: string }
  | { template: 'testMail'; name: string; sentBy: string }
  // ── แจ้งเตือนงาน ──
  | { template: 'incidentReceived'; name: string; docNo: string; title: string; url: string }
  | { template: 'incidentAssigned'; name: string; docNo: string; title: string; priority: string; service?: string; url: string }
  | { template: 'incidentCritical'; name: string; docNo: string; title: string; priority: string; major: boolean; url: string }
  | { template: 'incidentUpdateForUser'; name: string; docNo: string; title: string; note: string; url: string }
  | { template: 'incidentUserReplied'; name: string; docNo: string; title: string; note: string; url: string }
  | { template: 'incidentResolved'; name: string; docNo: string; title: string; note: string; url: string }
  | { template: 'slaNearBreach'; name: string; docNo: string; title: string; priority: string; left: string; url: string }
  | { template: 'slaBreached'; name: string; docNo: string; title: string; priority: string; overrun: string; url: string }
  | { template: 'changeApprovalRequest'; name: string; docNo: string; title: string; type: string; board: string; window: string; url: string }
  | { template: 'changeDecision'; name: string; docNo: string; title: string; approved: boolean; comment?: string; url: string }
  | { template: 'requestApprovalNeeded'; name: string; docNo: string; title: string; requester: string; url: string }
  | { template: 'requestStatus'; name: string; docNo: string; title: string; state: 'APPROVED' | 'REJECTED' | 'DELIVERED'; note?: string; url: string };

export type TemplateName = MailMessage['template'];

/** ประเภทของอีเมล: critical = ด้านความปลอดภัย (ส่งเสมอ) · ไม่งั้นผูกกับหมวดค่าตั้งการแจ้งเตือนของผู้ใช้ */
export const TEMPLATE_META: Record<TemplateName, { critical: true } | { critical: false; category: NotifyCategory }> = {
  passwordReset: { critical: true },
  passwordInvite: { critical: true },
  passwordResetByAdmin: { critical: true },
  passwordChanged: { critical: true },
  testMail: { critical: true },
  incidentReceived: { critical: false, category: 'myItems' },
  incidentAssigned: { critical: false, category: 'assigned' },
  incidentCritical: { critical: false, category: 'critical' },
  incidentUpdateForUser: { critical: false, category: 'myItems' },
  incidentUserReplied: { critical: false, category: 'assigned' },
  incidentResolved: { critical: false, category: 'myItems' },
  slaNearBreach: { critical: false, category: 'sla' },
  slaBreached: { critical: false, category: 'sla' },
  changeApprovalRequest: { critical: false, category: 'approvals' },
  changeDecision: { critical: false, category: 'myItems' },
  requestApprovalNeeded: { critical: false, category: 'approvals' },
  requestStatus: { critical: false, category: 'myItems' },
};

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

interface Doc {
  subject: string;
  heading: string;
  greeting: string;
  paragraphs: string[];
  facts?: [string, string][];
  cta?: { label: string; url: string };
  quote?: string; // ข้อความจากผู้ใช้/เจ้าหน้าที่ (แสดงเป็นกรอบอ้างอิง)
  warning?: string; // ข้อความเตือนด้านความปลอดภัย
}

/** escape สำหรับ HTML (ทั้งเนื้อความและ attribute) */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** subject/ที่อยู่ ห้ามมีขึ้นบรรทัดใหม่ (กัน header injection) และจำกัดความยาว */
export function oneLine(v: string, max = 200): string {
  return v.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** ลิงก์ในอีเมลต้องเป็น http(s) เท่านั้น (กัน javascript: และ data:) */
export function safeUrl(url: string): string {
  const u = new URL(url); // โยนข้อผิดพลาดถ้ารูปแบบไม่ถูกต้อง
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('ลิงก์ในอีเมลต้องเป็น http(s)');
  return u.toString();
}

const C = { ink: '#16191D', muted: '#5B6170', border: '#DADDD6', page: '#EEF0EC', subtle: '#F7F8F5', accent: '#1F4FD8', warn: '#8A3A06', warnBg: '#FDEFD9' };

function renderDoc(doc: Doc, critical: boolean, accountUrl: string): Rendered {
  const cta = doc.cta ? { label: doc.cta.label, url: safeUrl(doc.cta.url) } : undefined;
  const footer = critical
    ? 'อีเมลนี้เป็นการแจ้งเตือนด้านความปลอดภัยของบัญชี ไม่สามารถปิดการรับได้'
    : 'คุณได้รับอีเมลนี้เพราะเปิดการแจ้งเตือนไว้ — ปรับได้ที่ “บัญชีของฉัน”';

  const text = [
    doc.greeting,
    '',
    ...doc.paragraphs.flatMap((p) => [p, '']),
    ...(doc.facts ? [...doc.facts.map(([k, v]) => `${k}: ${v}`), ''] : []),
    ...(doc.quote ? [...doc.quote.split('\n').map((l) => `> ${l}`), ''] : []),
    ...(cta ? [`${cta.label}:`, cta.url, ''] : []),
    ...(doc.warning ? [`⚠ ${doc.warning}`, ''] : []),
    '— ServiceHub',
    footer + (critical ? '' : ` (${accountUrl})`),
  ].join('\n');

  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:${C.page};font-family:'IBM Plex Sans Thai',Tahoma,Arial,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto"><tr><td>
<div style="font-weight:700;font-size:15px;margin:0 0 12px 4px">ServiceHub <span style="font-weight:400;color:${C.muted}">· ITSM</span></div>
<div style="background:#fff;border:1px solid ${C.border};border-radius:10px;padding:24px">
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.35">${esc(doc.heading)}</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${esc(doc.greeting)}</p>
${doc.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${esc(p)}</p>`).join('\n')}
${doc.facts ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:${C.subtle};border-radius:8px"><tbody>${doc.facts
    .map(([k, v]) => `<tr><td style="padding:8px 12px;font-size:13px;color:${C.muted};white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:8px 12px;font-size:14px;font-weight:600">${esc(v)}</td></tr>`)
    .join('')}</tbody></table>` : ''}
${doc.quote ? `<blockquote style="margin:0 0 16px;padding:10px 14px;border-left:3px solid ${C.border};background:${C.subtle};font-size:14px;line-height:1.6;white-space:pre-line">${esc(doc.quote)}</blockquote>` : ''}
${cta ? `<p style="margin:0 0 16px"><a href="${esc(cta.url)}" style="display:inline-block;background:${C.accent};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${esc(cta.label)}</a></p>
<p style="margin:0 0 14px;font-size:12px;color:${C.muted};word-break:break-all">หรือคัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:<br>${esc(cta.url)}</p>` : ''}
${doc.warning ? `<p style="margin:0;padding:10px 12px;background:${C.warnBg};color:${C.warn};border-radius:8px;font-size:13px;line-height:1.5">${esc(doc.warning)}</p>` : ''}
</div>
<p style="margin:14px 4px 0;font-size:12px;color:${C.muted};line-height:1.5">${esc(footer)}</p>
</td></tr></table></body></html>`;

  return { subject: oneLine(doc.subject), text, html };
}

const hi = (name: string) => `สวัสดีคุณ${name}`;

function buildDoc(m: MailMessage): Doc {
  switch (m.template) {
    case 'passwordReset':
      return {
        subject: 'ตั้งรหัสผ่านใหม่ — ServiceHub',
        heading: 'ตั้งรหัสผ่านใหม่',
        greeting: hi(m.name),
        paragraphs: [`เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์ใช้ได้ภายใน ${m.minutes} นาทีและใช้ได้ครั้งเดียว`],
        cta: { label: 'ตั้งรหัสผ่านใหม่', url: m.url },
        warning: 'หากคุณไม่ได้เป็นผู้ขอ ให้เพิกเฉยต่ออีเมลนี้ รหัสผ่านเดิมของคุณยังไม่เปลี่ยนแปลง และไม่ต้องส่งต่อลิงก์นี้ให้ใคร',
      };
    case 'passwordInvite':
      return {
        subject: 'คุณได้รับเชิญให้ใช้ ServiceHub — ตั้งรหัสผ่านของคุณ',
        heading: 'ยินดีต้อนรับสู่ ServiceHub',
        greeting: hi(m.name),
        paragraphs: [`ผู้ดูแลระบบสร้างบัญชีให้คุณแล้ว กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านของคุณเอง ลิงก์ใช้ได้ภายใน ${m.hours} ชั่วโมงและใช้ได้ครั้งเดียว`],
        cta: { label: 'ตั้งรหัสผ่านและเริ่มใช้งาน', url: m.url },
        warning: 'หากคุณไม่คาดว่าจะได้รับอีเมลนี้ ให้เพิกเฉยหรือแจ้งผู้ดูแลระบบ',
      };
    case 'passwordResetByAdmin':
      return {
        subject: 'ผู้ดูแลระบบส่งลิงก์ตั้งรหัสผ่านใหม่ให้คุณ — ServiceHub',
        heading: 'ตั้งรหัสผ่านใหม่',
        greeting: hi(m.name),
        paragraphs: [`ผู้ดูแลระบบส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ของบัญชีคุณ ลิงก์ใช้ได้ภายใน ${m.hours} ชั่วโมงและใช้ได้ครั้งเดียว รหัสผ่านเดิมยังใช้ได้จนกว่าคุณจะตั้งใหม่`],
        cta: { label: 'ตั้งรหัสผ่านใหม่', url: m.url },
        warning: 'หากคุณไม่ได้ขอให้ผู้ดูแลทำเช่นนี้ ให้แจ้งผู้ดูแลระบบทันที',
      };
    case 'passwordChanged':
      return {
        subject: 'รหัสผ่านของคุณถูกเปลี่ยนแล้ว — ServiceHub',
        heading: 'รหัสผ่านถูกเปลี่ยนแล้ว',
        greeting: hi(m.name),
        paragraphs: [`รหัสผ่านของบัญชีคุณถูกเปลี่ยนเมื่อ ${m.when} และทุกอุปกรณ์ถูกออกจากระบบแล้ว`],
        cta: { label: 'ลืมรหัสผ่าน / ตั้งใหม่อีกครั้ง', url: m.forgotUrl },
        warning: 'หากไม่ใช่คุณเป็นผู้เปลี่ยน บัญชีอาจถูกผู้อื่นเข้าถึง ให้ตั้งรหัสผ่านใหม่ทันทีและแจ้งผู้ดูแลระบบ',
      };
    case 'testMail':
      return {
        subject: 'ทดสอบการส่งอีเมล — ServiceHub',
        heading: 'ทดสอบการส่งอีเมล',
        greeting: hi(m.name),
        paragraphs: [`นี่คืออีเมลทดสอบที่ ${m.sentBy} สั่งส่งจากหน้าผู้ดูแลระบบ หากคุณเห็นข้อความนี้ แสดงว่าการตั้งค่า SMTP ทำงานถูกต้อง`],
      };
    case 'incidentReceived':
      return {
        subject: `รับเรื่องแล้ว ${m.docNo}: ${m.title}`,
        heading: 'เรารับเรื่องของคุณแล้ว',
        greeting: hi(m.name),
        paragraphs: ['ทีม IT ได้รับเรื่องที่คุณแจ้งแล้ว และจะแจ้งความคืบหน้าให้ทราบ คุณติดตามสถานะได้ตลอดในพอร์ทัล'],
        facts: [['เลขที่', m.docNo], ['เรื่อง', m.title]],
        cta: { label: 'ติดตามเรื่องของฉัน', url: m.url },
      };
    case 'incidentAssigned':
      return {
        subject: `[${m.priority}] มอบหมายงานให้คุณ ${m.docNo}: ${m.title}`,
        heading: 'มีงานมอบหมายให้คุณ',
        greeting: hi(m.name),
        paragraphs: ['มี Incident ที่มอบหมายให้คุณรับผิดชอบ'],
        facts: [['เลขที่', m.docNo], ['เรื่อง', m.title], ['ลำดับความสำคัญ', m.priority], ...(m.service ? ([['บริการ', m.service]] as [string, string][]) : [])],
        cta: { label: 'เปิดดู Incident', url: m.url },
      };
    case 'incidentCritical':
      return {
        subject: `${m.major ? '[MAJOR]' : `[${m.priority}]`} เหตุวิกฤต ${m.docNo}: ${m.title}`,
        heading: m.major ? 'ประกาศ Major Incident' : 'เหตุขัดข้องระดับวิกฤต',
        greeting: hi(m.name),
        paragraphs: [m.major ? 'มีการประกาศเป็น Major Incident ตามกระบวนการ ต้องการความสนใจทันที' : 'มี Incident ที่ลำดับความสำคัญสูงสุดเกิดขึ้น ต้องการความสนใจทันที'],
        facts: [['เลขที่', m.docNo], ['เรื่อง', m.title], ['ลำดับความสำคัญ', m.priority]],
        cta: { label: 'เปิดดู Incident', url: m.url },
      };
    case 'incidentUpdateForUser':
      return {
        subject: `อัปเดตเรื่องของคุณ ${m.docNo}: ${m.title}`,
        heading: 'ทีม IT อัปเดตเรื่องของคุณ',
        greeting: hi(m.name),
        paragraphs: [`มีข้อความใหม่จากทีม IT เกี่ยวกับเรื่อง ${m.docNo}`],
        quote: m.note,
        cta: { label: 'ดูและตอบกลับ', url: m.url },
      };
    case 'incidentUserReplied':
      return {
        subject: `ผู้ใช้ตอบกลับ ${m.docNo}: ${m.title}`,
        heading: 'ผู้ใช้ตอบกลับเรื่องที่คุณดูแล',
        greeting: hi(m.name),
        paragraphs: [`ผู้ใช้ตอบกลับเรื่อง ${m.docNo}`],
        quote: m.note,
        cta: { label: 'เปิดดู Incident', url: m.url },
      };
    case 'incidentResolved':
      return {
        subject: `แก้ไขแล้ว — โปรดยืนยัน ${m.docNo}: ${m.title}`,
        heading: 'ทีม IT แก้ไขเรื่องของคุณแล้ว',
        greeting: hi(m.name),
        paragraphs: ['กรุณาตรวจสอบว่าปัญหาหายแล้วหรือไม่ หากหายแล้วกดยืนยันปิดเรื่อง หากยังไม่หายให้แจ้งกลับได้ทันที'],
        quote: m.note,
        cta: { label: 'ตรวจสอบและยืนยัน', url: m.url },
      };
    case 'slaNearBreach':
      return {
        subject: `[SLA] ใกล้ผิดกำหนด ${m.docNo}: ${m.title}`,
        heading: 'ใกล้ผิด SLA',
        greeting: hi(m.name),
        paragraphs: ['Incident ต่อไปนี้ใกล้ถึงกำหนดแก้ไขตาม SLA'],
        facts: [['เลขที่', m.docNo], ['เรื่อง', m.title], ['ลำดับความสำคัญ', m.priority], ['เวลาที่เหลือ', m.left]],
        cta: { label: 'เปิดดู Incident', url: m.url },
      };
    case 'slaBreached':
      return {
        subject: `[SLA] ผิดกำหนดแล้ว ${m.docNo}: ${m.title}`,
        heading: 'ผิด SLA แล้ว',
        greeting: hi(m.name),
        paragraphs: ['Incident ต่อไปนี้เกินกำหนดแก้ไขตาม SLA แล้ว'],
        facts: [['เลขที่', m.docNo], ['เรื่อง', m.title], ['ลำดับความสำคัญ', m.priority], ['เกินกำหนด', m.overrun]],
        cta: { label: 'เปิดดู Incident', url: m.url },
      };
    case 'changeApprovalRequest':
      return {
        subject: `ขออนุมัติ ${m.board}: ${m.docNo} ${m.title}`,
        heading: `มี Change รอ ${m.board} พิจารณา`,
        greeting: hi(m.name),
        paragraphs: ['มี Change ที่รอการพิจารณาจากคุณ'],
        facts: [['เลขที่', m.docNo], ['เรื่อง', m.title], ['ประเภท', m.type], ['ช่วงเวลาดำเนินการ', m.window]],
        cta: { label: 'พิจารณา Change', url: m.url },
      };
    case 'changeDecision':
      return {
        subject: `${m.approved ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ'}: ${m.docNo} ${m.title}`,
        heading: m.approved ? 'Change ของคุณผ่านการอนุมัติ' : 'Change ของคุณไม่ผ่านการอนุมัติ',
        greeting: hi(m.name),
        paragraphs: [m.approved ? 'Change ที่คุณเสนอผ่านการพิจารณาแล้ว สามารถจัดตารางดำเนินการต่อได้' : 'Change ที่คุณเสนอไม่ผ่านการพิจารณา กลับเป็นร่างเพื่อแก้ไขและส่งใหม่'],
        facts: [['เลขที่', m.docNo], ['เรื่อง', m.title]],
        ...(m.comment ? { quote: m.comment } : {}),
        cta: { label: 'เปิดดู Change', url: m.url },
      };
    case 'requestApprovalNeeded':
      return {
        subject: `คำขอรออนุมัติ ${m.docNo}: ${m.title}`,
        heading: 'มีคำขอบริการรอการอนุมัติ',
        greeting: hi(m.name),
        paragraphs: [`${m.requester} ส่งคำขอบริการที่รอการอนุมัติ`],
        facts: [['เลขที่', m.docNo], ['คำขอ', m.title], ['ผู้ขอ', m.requester]],
        cta: { label: 'พิจารณาคำขอ', url: m.url },
      };
    case 'requestStatus': {
      const s = { APPROVED: 'อนุมัติแล้ว ทีม IT กำลังจัดเตรียม', REJECTED: 'ไม่ได้รับการอนุมัติ', DELIVERED: 'ส่งมอบเรียบร้อยแล้ว' }[m.state];
      return {
        subject: `คำขอของคุณ${m.state === 'APPROVED' ? 'อนุมัติแล้ว' : m.state === 'REJECTED' ? 'ไม่ได้รับการอนุมัติ' : 'ส่งมอบแล้ว'} ${m.docNo}: ${m.title}`,
        heading: `คำขอของคุณ${s}`,
        greeting: hi(m.name),
        paragraphs: [m.state === 'DELIVERED' ? 'ขอบคุณที่ใช้บริการ กรุณาให้คะแนนความพึงพอใจเพื่อช่วยให้เราปรับปรุงบริการ' : `สถานะคำขอ ${m.docNo} เปลี่ยนแปลง`],
        facts: [['เลขที่', m.docNo], ['คำขอ', m.title]],
        ...(m.note ? { quote: m.note } : {}),
        cta: { label: m.state === 'DELIVERED' ? 'ดูและให้คะแนน' : 'ติดตามคำขอ', url: m.url },
      };
    }
  }
}

export function render(m: MailMessage, accountUrl = 'http://localhost:3000/account'): Rendered {
  const meta = TEMPLATE_META[m.template];
  return renderDoc(buildDoc(m), meta.critical, accountUrl);
}

export interface InAppSummary {
  title: string;
  body: string;
  /** พาธภายในระบบ (ไม่มี origin) — เปิดจากกระดิ่งแจ้งเตือน */
  href: string | null;
}

/** ข้อมูลสำหรับแจ้งเตือนในระบบ (กระดิ่ง) — ใช้เนื้อหาชุดเดียวกับอีเมล จึงสอดคล้องกันและ escape แล้วตอนแสดงผลด้วย React */
export function summarize(m: MailMessage): InAppSummary {
  const doc = buildDoc(m);
  let href: string | null = null;
  if (doc.cta) {
    const u = new URL(safeUrl(doc.cta.url));
    href = `${u.pathname}${u.search}`;
  }
  const body = doc.quote ?? doc.paragraphs[0] ?? '';
  return { title: oneLine(doc.subject), body: body.slice(0, 280), href };
}
