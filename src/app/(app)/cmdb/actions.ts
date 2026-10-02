'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { CiClass, CiLifecycle, RelationType } from '@prisma/client';
import { getCurrentUser } from '@/lib/currentUser';
import { isDomainError } from '@/lib/errors';
import { assertCan, type Role } from '@/lib/permissions';
import { CmdbError, addRelationship, createCi, removeRelationship, updateCi, verifyCi, type CiInput } from '@/lib/cmdbService';

export type CiFormValues = Record<string, string>;
export type CiFormState = { error?: string; values?: CiFormValues } | undefined;

/** คืนค่าที่ผู้ใช้กรอก — React 19 ล้างช่อง uncontrolled หลังส่งฟอร์ม */
function valuesOf(fd: FormData): CiFormValues {
  const out: CiFormValues = {};
  for (const [k, v] of fd.entries()) if (!k.startsWith('$ACTION')) out[k] = String(v);
  return out;
}

const CLASSES = ['BUSINESS_SERVICE', 'APPLICATION', 'SERVER', 'DATABASE', 'NETWORK_DEVICE', 'CLOUD_RESOURCE', 'END_USER_DEVICE', 'SOFTWARE_LICENSE'];
const LIFECYCLES = ['PLANNED', 'LIVE', 'MAINTENANCE', 'RETIRED'];
const ENVS = ['Prod', 'UAT', 'Dev'];
const REL_TYPES = ['DEPENDS_ON', 'RUNS_ON', 'CONNECTS_TO', 'HOSTS'];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** Server Action เรียกได้จากหน้าไหนก็ได้ด้วย action ID — ตรวจสิทธิ์ที่นี่ทุกครั้ง (ไม่พึ่งแค่การซ่อนปุ่ม) */
async function cmdbUser() {
  const user = await getCurrentUser();
  assertCan(user.role as Role, 'cmdb.manage');
  return user;
}

function parse(fd: FormData): CiInput | { error: string } {
  const name = str(fd, 'name');
  if (!name) return { error: 'กรุณาระบุชื่อ CI' };
  if (name.length > 150) return { error: 'ชื่อยาวเกิน 150 ตัวอักษร' };
  if (!CLASSES.includes(str(fd, 'ciClass'))) return { error: 'กรุณาเลือกคลาส' };
  if (!LIFECYCLES.includes(str(fd, 'lifecycle'))) return { error: 'กรุณาเลือกสถานะวงจรชีวิต' };
  if (!ENVS.includes(str(fd, 'environment'))) return { error: 'กรุณาเลือกสภาพแวดล้อม' };
  return {
    name, subtitle: str(fd, 'subtitle'), ciClass: str(fd, 'ciClass') as CiClass, classLabel: str(fd, 'classLabel'),
    environment: str(fd, 'environment'), lifecycle: str(fd, 'lifecycle') as CiLifecycle,
    ownerGroupId: str(fd, 'ownerGroupId') || null, ownerUserId: str(fd, 'ownerUserId') || null, ownerLabel: str(fd, 'ownerLabel'),
    attributesText: String(fd.get('attributes') ?? ''),
  };
}

export async function createCiAction(_: CiFormState, fd: FormData): Promise<CiFormState> {
  const input = parse(fd);
  if ('error' in input) return { ...input, values: valuesOf(fd) };
  let ciId: string;
  try {
    const user = await cmdbUser();
    ciId = (await createCi(input, user.id)).ciId;
  } catch (e) {
    if (isDomainError(e)) return { error: e.message, values: valuesOf(fd) };
    throw e;
  }
  revalidatePath('/cmdb', 'layout');
  redirect(`/cmdb/${ciId}`);
}

export async function updateCiAction(ciId: string, _: CiFormState, fd: FormData): Promise<CiFormState> {
  const input = parse(fd);
  if ('error' in input) return { ...input, values: valuesOf(fd) };
  try {
    const user = await cmdbUser();
    await updateCi(ciId, input, user.id);
  } catch (e) {
    if (isDomainError(e)) return { error: e.message, values: valuesOf(fd) };
    throw e;
  }
  revalidatePath('/cmdb', 'layout');
  redirect(`/cmdb/${ciId}`);
}

async function run(ciId: string, fn: (userId: string | null) => Promise<unknown>): Promise<never> {
  let error: string | null = null;
  try {
    const user = await cmdbUser();
    await fn(user.id);
  } catch (e) {
    if (isDomainError(e)) error = e.message;
    else throw e;
  }
  revalidatePath('/cmdb', 'layout');
  redirect(`/cmdb/${ciId}${error ? `?error=${encodeURIComponent(error)}` : ''}`);
}

export async function verifyCiAction(ciId: string) {
  await run(ciId, (uid) => verifyCi(ciId, uid));
}

export async function addRelationshipAction(ciId: string, fd: FormData) {
  const type = str(fd, 'type');
  await run(ciId, async (uid) => {
    if (!REL_TYPES.includes(type)) throw new CmdbError('ประเภทความสัมพันธ์ไม่ถูกต้อง');
    if (!str(fd, 'target')) throw new CmdbError('กรุณาเลือก CI ปลายทาง');
    await addRelationship(ciId, str(fd, 'target'), type as RelationType, uid);
  });
}

export async function removeRelationshipAction(ciId: string, relId: string) {
  await run(ciId, (uid) => removeRelationship(relId, uid));
}
