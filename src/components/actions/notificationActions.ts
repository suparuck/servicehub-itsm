'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/currentUser';
import { markAllRead, markRead } from '@/lib/notificationService';

// ต้องผ่าน getCurrentUser ทุกครั้ง: server action ถูกเรียกด้วย id จาก URL ใดก็ได้ — ผู้ใช้อ่านได้เฉพาะของตนเอง (กรองด้วย userId ใน service)
export async function markReadAction(id: string) {
  const user = await getCurrentUser();
  await markRead(user.id, String(id));
  revalidatePath('/', 'layout');
}

export async function markAllReadAction() {
  const user = await getCurrentUser();
  await markAllRead(user.id);
  revalidatePath('/', 'layout');
}
