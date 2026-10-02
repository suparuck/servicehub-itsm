import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from './db';
import { isSessionStale } from './session';

/**
 * ผู้ใช้ที่ล็อกอินอยู่ (อ่านจาก session แล้วดึงข้อมูลล่าสุดจาก DB เพื่อให้การเปลี่ยนบทบาท/ปิดบัญชีมีผลทันที)
 * redirect ไป /login เมื่อ: ไม่ได้ล็อกอิน · บัญชีถูกปิด · session ออกก่อนการเปลี่ยนรหัสผ่านล่าสุด
 * redirect ไป /account เมื่อต้องเปลี่ยนรหัสผ่านชั่วคราวก่อน (ยกเว้น allowMustChange ที่หน้า/ action ของ /account เอง)
 * ใช้ได้ทั้งใน server component และ server action — action ที่เปลี่ยนข้อมูลทุกตัวผ่านฟังก์ชันนี้
 */
export async function getCurrentUser(opts: { allowMustChange?: boolean } = {}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.active) redirect('/login?reason=inactive');
  if (isSessionStale(session.authAt, user.passwordChangedAt)) redirect('/login?reason=expired');
  if (user.mustChangePassword && !opts.allowMustChange) redirect('/account?required=1');
  return user;
}
