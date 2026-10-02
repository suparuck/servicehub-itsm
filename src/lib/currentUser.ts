import { db } from './db';

// ยังไม่มี Auth (NextAuth มาในเฟสถัดไป) — ใช้ผู้ใช้ตัวอย่างจาก seed
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL ?? 'somsak@servicehub.local';

export async function getCurrentUser() {
  return db.user.findUnique({ where: { email: DEMO_EMAIL } });
}
