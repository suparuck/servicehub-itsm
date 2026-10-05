'use server';

import { runAction } from '@/lib/actionUtils';
import { getCurrentUser } from '@/lib/currentUser';
import type { Role } from '@/lib/permissions';
import { assignIncident, claimIncident, createMacro, createRule, deleteMacro, deleteRule, logOnBehalf, setMacroActive, setRuleActive } from '@/lib/serviceDeskService';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

// ทุก action ผ่าน getCurrentUser + assertCan ใน service — server action ถูกเรียกได้จากทุกที่ ห้ามเชื่อแค่การซ่อนปุ่ม
async function actor() {
  const u = await getCurrentUser();
  return { id: u.id, role: u.role as Role, name: u.name };
}

export async function claimAction(id: string) {
  await runAction('/service-desk', async () => { await claimIncident(await actor(), id); });
}

export async function assignAction(id: string, fd: FormData) {
  await runAction('/service-desk', async () => { await assignIncident(await actor(), id, str(fd, 'assigneeId')); });
}

export async function logOnBehalfAction(fd: FormData) {
  await runAction('/service-desk/new', async () => {
    const r = await logOnBehalf(await actor(), {
      callerId: str(fd, 'callerId'), channel: str(fd, 'channel'), type: str(fd, 'type'), title: str(fd, 'title'), description: str(fd, 'description'),
      impact: str(fd, 'impact'), urgency: str(fd, 'urgency'), serviceId: str(fd, 'serviceId'), catalogId: str(fd, 'catalogId'),
    });
    return r.href;
  });
}

export async function createRuleAction(fd: FormData) {
  await runAction('/service-desk/rules', async () => {
    await createRule(await actor(), { name: str(fd, 'name'), serviceId: str(fd, 'serviceId'), groupId: str(fd, 'groupId'), assigneeId: str(fd, 'assigneeId'), sortOrder: str(fd, 'sortOrder') });
  });
}

export async function toggleRuleAction(id: string, active: boolean) {
  await runAction('/service-desk/rules', async () => { await setRuleActive(await actor(), id, active); });
}

export async function deleteRuleAction(id: string) {
  await runAction('/service-desk/rules', async () => { await deleteRule(await actor(), id); });
}

export async function createMacroAction(fd: FormData) {
  await runAction('/service-desk/macros', async () => { await createMacro(await actor(), { title: str(fd, 'title'), body: str(fd, 'body'), sortOrder: str(fd, 'sortOrder') }); });
}

export async function toggleMacroAction(id: string, active: boolean) {
  await runAction('/service-desk/macros', async () => { await setMacroActive(await actor(), id, active); });
}

export async function deleteMacroAction(id: string) {
  await runAction('/service-desk/macros', async () => { await deleteMacro(await actor(), id); });
}
