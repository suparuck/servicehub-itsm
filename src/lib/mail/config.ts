// ค่าตั้งอีเมลจาก environment (อ่านตอนเรียกใช้ ไม่ cache — ทดสอบและเปลี่ยนค่าได้ง่าย)
export type Env = Record<string, string | undefined>;

/** URL สาธารณะของระบบ ใช้สร้างลิงก์ในอีเมล — ต้องมาจากค่าที่ผู้ดูแลตั้ง ไม่ใช่จาก header ของคำขอ (กัน Host header poisoning) */
export function appUrl(env: Env = process.env): string {
  const raw = env.APP_URL || env.AUTH_URL || 'http://localhost:3000';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch {
    return 'http://localhost:3000';
  }
}

export const absoluteUrl = (path: string, env: Env = process.env) => `${appUrl(env)}${path.startsWith('/') ? path : `/${path}`}`;

export interface MailConfig {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export function mailConfig(env: Env = process.env): MailConfig {
  const port = Number(env.SMTP_PORT) || 587;
  return {
    configured: Boolean(env.SMTP_HOST),
    host: env.SMTP_HOST ?? '',
    port,
    // พอร์ต 465 = TLS ตั้งแต่เริ่ม; พอร์ตอื่นใช้ STARTTLS เมื่อเซิร์ฟเวอร์รองรับ (SMTP_SECURE=true บังคับ TLS ตั้งแต่เริ่ม)
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    user: env.SMTP_USER || undefined,
    pass: env.SMTP_PASSWORD || undefined,
    from: env.MAIL_FROM || 'ServiceHub <no-reply@servicehub.local>',
  };
}
