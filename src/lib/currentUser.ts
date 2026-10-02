import { cookies } from 'next/headers';
import { db } from './db';

// ยังไม่มี Auth (NextAuth/Entra ID มาภายหลัง) — ผู้ใช้เจ้าหน้าที่ตัวอย่างเลือกได้ด้วยคุกกี้ `demo_user`
// ตั้งค่า DEMO_USER_SWITCH=off เพื่อปิดการสลับ (ใช้ผู้ใช้จาก DEMO_USER_EMAIL เท่านั้น)
const DEFAULT_EMAIL = process.env.DEMO_USER_EMAIL ?? 'somsak@servicehub.local';
export const DEMO_COOKIE = 'demo_user';
export const switchEnabled = () => process.env.DEMO_USER_SWITCH !== 'off';

export async function getCurrentUser() {
  let email = DEFAULT_EMAIL;
  if (switchEnabled()) {
    const c = (await cookies()).get(DEMO_COOKIE)?.value;
    if (c) email = c;
  }
  const user = await db.user.findUnique({ where: { email } });
  // คุกกี้เก่า/ผู้ใช้ปลายทางห้ามเข้าโหมดเจ้าหน้าที่ → กลับไปค่าเริ่มต้น
  if (!user || user.role === 'END_USER') return db.user.findUnique({ where: { email: DEFAULT_EMAIL } });
  return user;
}
