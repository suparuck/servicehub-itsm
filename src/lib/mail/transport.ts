import nodemailer, { type Transporter } from 'nodemailer';
import { mailConfig, type Env } from './config';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** ผลการส่ง: ok หรือ error (ข้อความสั้น ๆ ไม่มีรหัสผ่าน) */
export type SendResult = { ok: true } | { ok: false; error: string; permanent: boolean };

let cached: { key: string; transporter: Transporter } | null = null;

function transporterFor(env: Env): Transporter | null {
  const c = mailConfig(env);
  if (!c.configured) return null;
  const key = JSON.stringify([c.host, c.port, c.secure, c.user, c.pass]);
  if (cached?.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.secure,
        auth: c.user ? { user: c.user, pass: c.pass ?? '' } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return cached.transporter;
}

/** รหัสตอบกลับ 5xx = ปฏิเสธถาวร (เช่น ที่อยู่ผิด) ไม่ต้อง retry */
export function isPermanent(err: unknown): boolean {
  const code = (err as { responseCode?: number } | null)?.responseCode;
  return typeof code === 'number' && code >= 500 && code < 600;
}

export const safeError = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/[\r\n]+/g, ' ').slice(0, 300);

export async function sendMail(mail: OutgoingMail, env: Env = process.env): Promise<SendResult> {
  const t = transporterFor(env);
  if (!t) return { ok: false, error: 'ยังไม่ได้ตั้งค่า SMTP_HOST', permanent: false };
  try {
    await t.sendMail({ from: mailConfig(env).from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError(err), permanent: isPermanent(err) };
  }
}
