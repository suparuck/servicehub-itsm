'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { CiClass, CiLifecycle, RelationType } from '@prisma/client';
import { getCurrentUser } from '@/lib/currentUser';
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
  const user = await getCurrentUser();
  const ci = await createCi(input, user?.id ?? null);
  revalidatePath('/cmdb', 'layout');
  redirect(`/cmdb/${ci.ciId}`);
}

export async function updateCiAction(ciId: string, _: CiFormState, fd: FormData): Promise<CiFormState> {
  const input = parse(fd);
  if ('error' in input) return { ...input, values: valuesOf(fd) };
  const user = await getCurrentUser();
  try {
    await updateCi(ciId, input, user?.id ?? null);
  } catch (e) {
    if (e instanceof CmdbError) return { error: e.message, values: valuesOf(fd) };
    throw e;
  }
  revalidatePath('/cmdb', 'layout');
  redirect(`/cmdb/${ciId}`);
}

async function run(ciId: string, fn: (userId: string | null) => Promise<unknown>): Promise<never> {
  const user = await getCurrentUser();
  let error: string | null = null;
  try {
    await fn(user?.id ?? null);
  } catch (e) {
    if (e instanceof CmdbError) error = e.message;
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
