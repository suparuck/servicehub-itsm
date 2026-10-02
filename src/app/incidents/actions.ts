'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Level } from '@prisma/client';
import { getCurrentUser } from '@/lib/currentUser';
import { formatDocNo } from '@/lib/docno';
import { ALL_STATUSES, type IncidentStatus } from '@/lib/incident';
import {
  IncidentError,
  addNote,
  changeStatus,
  createIncident,
  createProblemFromIncident,
  escalateMajor,
  updateIncident,
  type IncidentInput,
} from '@/lib/incidentService';
import { db } from '@/lib/db';

export type FormValues = Record<string, string | string[]>;
export type FormState = { error?: string; values?: FormValues } | undefined;

/** คืนค่าที่ผู้ใช้กรอก — React 19 ล้างช่อง uncontrolled หลังส่งฟอร์ม จึงต้องส่งกลับไปเติมใหม่ */
function valuesOf(fd: FormData): FormValues {
  const out: FormValues = {};
  for (const k of new Set(fd.keys())) {
    if (k.startsWith('$ACTION')) continue;
    const all = fd.getAll(k).map(String);
    out[k] = all.length > 1 || k === 'ciIds' ? all : all[0];
  }
  return out;
}

const LEVELS = ['HIGH', 'MED', 'LOW'];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

function parseInput(fd: FormData): IncidentInput | { error: string } {
  const title = str(fd, 'title');
  const impact = str(fd, 'impact');
  const urgency = str(fd, 'urgency');
  if (!title) return { error: 'กรุณาระบุหัวข้อเหตุขัดข้อง' };
  if (title.length > 200) return { error: 'หัวข้อยาวเกิน 200 ตัวอักษร' };
  if (!LEVELS.includes(impact) || !LEVELS.includes(urgency)) return { error: 'กรุณาเลือกผลกระทบและความเร่งด่วน' };
  return {
    title,
    description: str(fd, 'description'),
    impact: impact as Level,
    urgency: urgency as Level,
    serviceId: str(fd, 'serviceId') || null,
    groupId: str(fd, 'groupId') || null,
    assigneeId: str(fd, 'assigneeId') || null,
    category: str(fd, 'category') || null,
    ciIds: fd.getAll('ciIds').map(String).filter(Boolean),
  };
}

async function docNo(id: string) {
  const inc = await db.incident.findUnique({ where: { id }, select: { seq: true } });
  return inc ? formatDocNo('INC', inc.seq) : null;
}

export async function createIncidentAction(_: FormState, fd: FormData): Promise<FormState> {
  const input = parseInput(fd);
  if ('error' in input) return { ...input, values: valuesOf(fd) };
  const user = await getCurrentUser();
  const inc = await createIncident(input, user?.id ?? null);
  revalidatePath('/', 'layout');
  redirect(`/incidents/${formatDocNo('INC', inc.seq)}`);
}

export async function updateIncidentAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const input = parseInput(fd);
  if ('error' in input) return { ...input, values: valuesOf(fd) };
  const user = await getCurrentUser();
  try {
    await updateIncident(id, input, user?.id ?? null);
  } catch (e) {
    if (e instanceof IncidentError) return { error: e.message, values: valuesOf(fd) };
    throw e;
  }
  revalidatePath('/', 'layout');
  redirect(`/incidents/${await docNo(id)}`);
}

// ── การกระทำบนหน้ารายละเอียด: ส่ง error กลับด้วย redirect ?error= ──────────
async function run(id: string, fn: (userId: string | null) => Promise<unknown>): Promise<never> {
  const user = await getCurrentUser();
  const no = await docNo(id);
  let error: string | null = null;
  try {
    await fn(user?.id ?? null);
  } catch (e) {
    if (e instanceof IncidentError) error = e.message;
    else throw e;
  }
  revalidatePath('/', 'layout');
  redirect(`/incidents/${no}${error ? `?error=${encodeURIComponent(error)}` : ''}`);
}

export async function addNoteAction(id: string, fd: FormData) {
  const customer = str(fd, 'visibility') === 'CUSTOMER';
  await run(id, (uid) => addNote(id, str(fd, 'body'), customer ? 'CUSTOMER' : 'INTERNAL', customer ? 'สื่อสารผู้ใช้' : 'บันทึกการทำงาน', uid));
}

export async function changeStatusAction(id: string, fd: FormData) {
  const to = str(fd, 'status') as IncidentStatus;
  if (!ALL_STATUSES.includes(to)) return run(id, async () => { throw new IncidentError('สถานะไม่ถูกต้อง'); });
  await run(id, (uid) => changeStatus(id, to, uid, str(fd, 'note')));
}

export async function escalateAction(id: string) {
  await run(id, (uid) => escalateMajor(id, uid));
}

export async function createProblemAction(id: string) {
  await run(id, (uid) => createProblemFromIncident(id, uid));
}
