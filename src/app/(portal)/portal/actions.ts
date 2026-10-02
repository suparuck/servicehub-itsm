'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { formatDocNo } from '@/lib/docno';
import { IncidentError, addNote, changeStatus, createIncident } from '@/lib/incidentService';
import { answersToLevels } from '@/lib/portal';
import { PortalError, getOwnedItem, getPortalUser, submitRequest, submitSurvey } from '@/lib/portalService';

export type PortalFormState = { error?: string; values?: Record<string, string> } | undefined;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const valuesOf = (fd: FormData) => {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (!k.startsWith('$ACTION')) out[k] = String(v);
  return out;
};

async function requireUser() {
  const user = await getPortalUser();
  if (!user) throw new PortalError('ไม่พบผู้ใช้');
  return user;
}

export async function reportIncidentAction(_: PortalFormState, fd: FormData): Promise<PortalFormState> {
  const title = str(fd, 'title');
  if (!title) return { error: 'กรุณาระบุปัญหาที่พบ', values: valuesOf(fd) };
  if (title.length > 200) return { error: 'หัวข้อยาวเกิน 200 ตัวอักษร', values: valuesOf(fd) };
  const user = await requireUser();
  const { impact, urgency } = answersToLevels(str(fd, 'scope'), str(fd, 'block'));
  const serviceId = str(fd, 'serviceId') || null;
  const [service, deskGroup] = await Promise.all([
    serviceId ? db.service.findUnique({ where: { id: serviceId } }) : null,
    db.assignmentGroup.findFirst({ where: { name: 'Service Desk L1' } }),
  ]);
  const inc = await createIncident(
    {
      title, description: str(fd, 'description'), impact, urgency, serviceId: service?.id ?? null,
      groupId: deskGroup?.id ?? null, category: service?.category ?? null, channel: 'พอร์ทัลผู้ใช้',
    },
    user.id,
  );
  revalidatePath('/', 'layout');
  redirect(`/portal/my/${formatDocNo('INC', inc.seq)}`);
}

export async function submitRequestAction(_: PortalFormState, fd: FormData): Promise<PortalFormState> {
  const user = await requireUser();
  try {
    const req = await submitRequest(user.id, { catalogId: str(fd, 'catalogId'), title: str(fd, 'title'), description: str(fd, 'description') });
    revalidatePath('/portal', 'layout');
    redirect(`/portal/my/${formatDocNo('REQ', req.seq)}`);
  } catch (e) {
    if (e instanceof PortalError) return { error: e.message, values: valuesOf(fd) };
    throw e;
  }
}

async function run(docNo: string, fn: (userId: string) => Promise<unknown>): Promise<never> {
  const user = await requireUser();
  let error: string | null = null;
  try {
    await fn(user.id);
  } catch (e) {
    if (e instanceof PortalError || e instanceof IncidentError) error = e.message;
    else throw e;
  }
  revalidatePath('/', 'layout');
  redirect(`/portal/my/${docNo}${error ? `?error=${encodeURIComponent(error)}` : ''}`);
}

async function ownedIncident(userId: string, docNo: string) {
  const o = await getOwnedItem(userId, docNo);
  if (!o || o.kind !== 'INC') throw new PortalError('ไม่พบรายการ');
  return o.inc;
}

export async function replyAction(docNo: string, fd: FormData) {
  await run(docNo, async (uid) => {
    const inc = await ownedIncident(uid, docNo);
    if (inc.status === 'CLOSED') throw new PortalError('เรื่องนี้ปิดแล้ว หากยังมีปัญหาให้แจ้งใหม่');
    await addNote(inc.id, str(fd, 'body'), 'CUSTOMER', 'ผู้ใช้ตอบกลับ', uid);
    // ตอบกลับตอนรอข้อมูลจากผู้ใช้ → งานเดินต่อและ SLA กลับมานับ
    if (inc.status === 'PENDING_USER') await changeStatus(inc.id, 'IN_PROGRESS', uid, 'ผู้ใช้ตอบกลับแล้ว ดำเนินการต่อ');
  });
}

export async function confirmResolvedAction(docNo: string) {
  await run(docNo, async (uid) => {
    const inc = await ownedIncident(uid, docNo);
    if (inc.status !== 'RESOLVED') throw new PortalError('เรื่องนี้ยังไม่อยู่ในสถานะรอการยืนยัน');
    await changeStatus(inc.id, 'CLOSED', uid, 'ผู้ใช้ยืนยันว่าปัญหาหายแล้ว');
  });
}

export async function reopenAction(docNo: string, fd: FormData) {
  await run(docNo, async (uid) => {
    const inc = await ownedIncident(uid, docNo);
    if (inc.status !== 'RESOLVED') throw new PortalError('เรื่องนี้ยังไม่อยู่ในสถานะรอการยืนยัน');
    await changeStatus(inc.id, 'IN_PROGRESS', uid, str(fd, 'reason') || 'ผู้ใช้แจ้งว่าปัญหายังไม่หาย');
  });
}

export async function surveyAction(docNo: string, fd: FormData) {
  await run(docNo, async (uid) => {
    await submitSurvey(uid, docNo, Number(fd.get('score')), str(fd, 'comment'));
  });
}

/** ประเมินจากหน้าแรก — กลับมาหน้าแรกหลังบันทึก */
export async function surveyFromHomeAction(docNo: string, fd: FormData) {
  const user = await requireUser();
  let error: string | null = null;
  try {
    await submitSurvey(user.id, docNo, Number(fd.get('score')), str(fd, 'comment'));
  } catch (e) {
    if (e instanceof PortalError) error = e.message;
    else throw e;
  }
  revalidatePath('/portal', 'layout');
  redirect(`/portal${error ? `?error=${encodeURIComponent(error)}` : '?rated=1'}`);
}
