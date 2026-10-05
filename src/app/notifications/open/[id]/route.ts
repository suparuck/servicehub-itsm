import { getCurrentUser } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { markRead, safeInternalPath } from '@/lib/notificationService';

export const dynamic = 'force-dynamic';

/**
 * เปิดการแจ้งเตือน: ทำเครื่องหมายว่าอ่านแล้วที่ฝั่งเซิร์ฟเวอร์ แล้วพาไปหน้าปลายทาง
 * ทำที่เซิร์ฟเวอร์ (ไม่ใช้ server action จากฝั่ง client) เพราะการเรียก action พร้อมการนำทางอาจถูกยกเลิกทิ้ง
 * ทำให้รายการยังขึ้นว่าไม่อ่านบน production · อ่านได้เฉพาะของตนเอง (markRead กรองด้วย userId)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const n = await db.notification.findFirst({ where: { id, userId: user.id }, select: { href: true } });
  if (n) await markRead(user.id, id);
  const target = n?.href && safeInternalPath(n.href) ? n.href : '/notifications';
  // Location แบบสัมพัทธ์ (ไม่อิงโฮสต์ภายในของเซิร์ฟเวอร์ standalone)
  return new Response(null, { status: 303, headers: { Location: target, 'Cache-Control': 'no-store' } });
}
