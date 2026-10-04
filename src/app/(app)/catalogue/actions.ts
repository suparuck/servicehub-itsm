'use server';

import { runAction } from '@/lib/actionUtils';
import { addCatalogItem, addOffering, createService, removeCatalogItem, removeOffering, setCatalogItemPublished, updateCatalogItem, updateService } from '@/lib/catalogueService';
import { getCurrentUser } from '@/lib/currentUser';
import type { Role } from '@/lib/permissions';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

// ทุก action ผ่าน getCurrentUser + assertCan ใน service — server action ถูกเรียกได้จากทุกที่ ห้ามเชื่อแค่การซ่อนปุ่ม
async function actor() {
  const u = await getCurrentUser();
  return { id: u.id, role: u.role as Role };
}
const back = (code: string) => `/catalogue/${encodeURIComponent(code)}`;

export async function createServiceAction(fd: FormData) {
  await runAction('/catalogue/new', async () => {
    const s = await createService(await actor(), {
      code: str(fd, 'code'), name: str(fd, 'name'), fullName: str(fd, 'fullName'), category: str(fd, 'category'),
      ownerName: str(fd, 'ownerName'), slaId: str(fd, 'slaId'), sortOrder: str(fd, 'sortOrder'),
    });
    return back(s.code);
  });
}

export async function updateServiceAction(code: string, fd: FormData) {
  await runAction(back(code), async () => {
    await updateService(await actor(), code, {
      name: str(fd, 'name'), fullName: str(fd, 'fullName'), category: str(fd, 'category'),
      ownerName: str(fd, 'ownerName'), slaId: str(fd, 'slaId'), sortOrder: str(fd, 'sortOrder'),
    });
  });
}

export async function addOfferingAction(code: string, fd: FormData) {
  await runAction(back(code), async () => { await addOffering(await actor(), code, { name: str(fd, 'name'), description: str(fd, 'description') }); });
}

export async function removeOfferingAction(code: string, offeringId: string) {
  await runAction(back(code), async () => { await removeOffering(await actor(), code, offeringId); });
}

const itemInput = (fd: FormData) => ({ name: str(fd, 'name'), items: str(fd, 'items'), slaText: str(fd, 'slaText'), sortOrder: str(fd, 'sortOrder') });

export async function addCatalogItemAction(code: string, fd: FormData) {
  await runAction(back(code), async () => { await addCatalogItem(await actor(), code, itemInput(fd)); });
}

export async function updateCatalogItemAction(code: string, itemId: string, fd: FormData) {
  await runAction(back(code), async () => { await updateCatalogItem(await actor(), code, itemId, itemInput(fd)); });
}

export async function setPublishedAction(code: string, itemId: string, published: boolean) {
  await runAction(back(code), async () => { await setCatalogItemPublished(await actor(), code, itemId, published); });
}

export async function removeCatalogItemAction(code: string, itemId: string) {
  await runAction(back(code), async () => { await removeCatalogItem(await actor(), code, itemId); });
}
