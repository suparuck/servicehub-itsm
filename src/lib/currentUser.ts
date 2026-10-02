import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from './db';

/**
 * ผู้ใช้ที่ล็อกอินอยู่ (อ่านจาก session แล้วดึงข้อมูลล่าสุดจาก DB เพื่อให้การเปลี่ยนบทบาท/ปิดบัญชีมีผลทันที)
 * ถ้าไม่ได้ล็อกอินหรือบัญชีถูกปิด จะ redirect ไปหน้า /login — จึงคืนค่าเป็น User เสมอ
 * ใช้ได้ทั้งใน server component และ server action (action ที่เปลี่ยนข้อมูลทุกตัวผ่านฟังก์ชันนี้)
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.active) redirect('/login?reason=inactive');
  return user;
}
