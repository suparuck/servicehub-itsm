// ตัวช่วยอ่านอีเมลจาก Mailpit (กล่องจดหมายทดสอบ) — ต้องมี Mailpit รันอยู่ (docker compose up มีให้ · CI ตั้งไว้แล้ว)
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

export interface TestMail {
  id: string;
  subject: string;
  to: string;
  text: string;
  html: string;
}

interface Summary { ID: string; Subject: string; To: { Address: string }[] }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MAILPIT}${path}`, init);
  if (!res.ok) throw new Error(`Mailpit ${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** อีเมลทั้งหมดที่ส่งถึงที่อยู่นี้ (ใหม่สุดก่อน) */
export async function mailsTo(address: string): Promise<TestMail[]> {
  const list = await api<{ messages: Summary[] }>(`/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  const out: TestMail[] = [];
  for (const m of list.messages) {
    const full = await api<{ Text: string; HTML: string }>(`/api/v1/message/${m.ID}`);
    out.push({ id: m.ID, subject: m.Subject, to: address, text: full.Text, html: full.HTML });
  }
  return out;
}

/** รออีเมลที่หัวข้อตรงกับ pattern ถึงที่อยู่นี้ (poll สูงสุด timeout มิลลิวินาที) */
export async function waitForMail(address: string, subject: RegExp, timeout = 30_000): Promise<TestMail> {
  const end = Date.now() + timeout;
  for (;;) {
    const hit = (await mailsTo(address)).find((m) => subject.test(m.subject));
    if (hit) return hit;
    if (Date.now() > end) throw new Error(`ไม่พบอีเมลถึง ${address} หัวข้อ ${subject} ภายใน ${timeout}ms`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** ยืนยันว่า "ไม่มี" อีเมลหัวข้อนี้ — รอสักครู่ให้ worker ทำงานก่อนค่อยตรวจ (กันผลลบเท็จ) */
export async function expectNoMail(address: string, subject: RegExp, settleMs = 8_000) {
  await new Promise((r) => setTimeout(r, settleMs));
  const hit = (await mailsTo(address)).find((m) => subject.test(m.subject));
  if (hit) throw new Error(`ไม่ควรมีอีเมลถึง ${address} หัวข้อ ${hit.subject}`);
}

/** ลิงก์แรกในเนื้อหาแบบข้อความที่ขึ้นต้นด้วย base และมี path ตามที่ระบุ */
export function linkIn(mail: TestMail, pathContains: string): string {
  const m = mail.text.match(new RegExp(`https?://\\S*${pathContains.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\S*`));
  if (!m) throw new Error(`ไม่พบลิงก์ ${pathContains} ในอีเมล:\n${mail.text}`);
  return m[0];
}
