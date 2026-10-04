'use server';

import { runAction } from '@/lib/actionUtils';
import { changeAssetStatus, createAsset, updateAsset } from '@/lib/assetService';
import { getCurrentUser } from '@/lib/currentUser';
import type { Role } from '@/lib/permissions';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

// ทุก action ผ่าน getCurrentUser + assertCan ใน service — server action ถูกเรียกได้จากทุกที่ ห้ามเชื่อแค่การซ่อนปุ่ม
async function actor() {
  const u = await getCurrentUser();
  return { id: u.id, role: u.role as Role };
}
const back = (tag: string) => `/assets/${encodeURIComponent(tag)}`;

const fields = (fd: FormData) => ({
  vendor: str(fd, 'vendor'), serialNo: str(fd, 'serialNo'), location: str(fd, 'location'), costBaht: str(fd, 'costBaht'),
  purchasedAt: str(fd, 'purchasedAt'), supportUntil: str(fd, 'supportUntil'), licenseQty: str(fd, 'licenseQty'), licenseUsed: str(fd, 'licenseUsed'),
});

export async function createAssetAction(fd: FormData) {
  await runAction('/assets/new', async () => {
    const a = await createAsset(await actor(), str(fd, 'ciId'), { ...fields(fd), status: str(fd, 'status') });
    return back(a.assetTag);
  });
}

export async function updateAssetAction(tag: string, fd: FormData) {
  await runAction(back(tag), async () => { await updateAsset(await actor(), tag, fields(fd)); });
}

export async function changeStatusAction(tag: string, fd: FormData) {
  await runAction(back(tag), async () => { await changeAssetStatus(await actor(), tag, str(fd, 'to'), { assigneeId: str(fd, 'assigneeId') || undefined, note: str(fd, 'note') }); });
}
