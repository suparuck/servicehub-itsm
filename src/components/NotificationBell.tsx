import { getCurrentUser } from '@/lib/currentUser';
import { thDateTime } from '@/lib/datetime';
import { getBell } from '@/lib/notificationService';
import { BellMenu } from './BellMenu';

/** กระดิ่งแจ้งเตือนของผู้ใช้ที่ล็อกอินอยู่ (server component — ดึงข้อมูลล่าสุดทุกครั้งที่หน้าถูกเรนเดอร์) */
export async function NotificationBell() {
  const user = await getCurrentUser();
  const { unread, items } = await getBell(user.id);
  return <BellMenu unread={unread} items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, read: n.read, when: thDateTime(n.createdAt) }))} />;
}
