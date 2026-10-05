'use server';

import { runAction } from '@/lib/actionUtils';
import { getCurrentUser } from '@/lib/currentUser';
import type { Role } from '@/lib/permissions';
import { resetAssetAlertDays, setAssetAlertDays } from '@/lib/settingsService';

// ทุก action ผ่าน getCurrentUser + assertCan ใน service — server action ถูกเรียกได้จากทุกที่ ห้ามเชื่อแค่การซ่อนปุ่ม
async function actor() {
  const u = await getCurrentUser();
  return { id: u.id, role: u.role as Role };
}

export async function saveAssetDaysAction(fd: FormData) {
  await runAction('/admin/alerts', async () => {
    await setAssetAlertDays(await actor(), String(fd.get('days') ?? ''));
    return '/admin/alerts?saved=1';
  });
}

export async function resetAssetDaysAction() {
  await runAction('/admin/alerts', async () => {
    await resetAssetAlertDays(await actor());
    return '/admin/alerts?saved=1';
  });
}
