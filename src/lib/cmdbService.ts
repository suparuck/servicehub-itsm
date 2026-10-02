import type { CiClass, CiLifecycle, RelationType } from '@prisma/client';
import { db } from './db';
import { diffFields, nextCiId, parseAttributes } from './cmdb';
import { wouldCreateCycle, type Rel } from './cmdbGraph';
import { th } from '@/i18n/th';
import { DomainError } from './errors';

export class CmdbError extends DomainError {}

export interface CiInput {
  name: string;
  subtitle?: string | null;
  ciClass: CiClass;
  classLabel?: string | null;
  environment: string;
  lifecycle: CiLifecycle;
  ownerGroupId?: string | null;
  ownerUserId?: string | null;
  ownerLabel?: string | null;
  attributesText?: string;
}

const editorName = async (userId: string | null) => (userId ? (await db.user.findUnique({ where: { id: userId } }))?.name : null) ?? 'ผู้ใช้';

export async function createCi(input: CiInput, userId: string | null) {
  const existing = (await db.configurationItem.findMany({ select: { ciId: true } })).map((c) => c.ciId);
  const ciId = nextCiId(input.ciClass, existing);
  const ci = await db.configurationItem.create({
    data: {
      ciId, name: input.name, subtitle: input.subtitle || null, ciClass: input.ciClass, classLabel: input.classLabel || null,
      environment: input.environment, lifecycle: input.lifecycle, ownerGroupId: input.ownerGroupId || null,
      ownerUserId: input.ownerUserId || null, ownerLabel: input.ownerLabel || null,
      attributes: parseAttributes(input.attributesText ?? ''),
      history: { create: { what: 'สร้าง CI', source: `เพิ่มโดย ${await editorName(userId)}` } },
    },
  });
  return ci;
}

export async function updateCi(ciId: string, input: CiInput, userId: string | null) {
  const cur = await db.configurationItem.findUnique({ where: { ciId } });
  if (!cur) throw new CmdbError('ไม่พบ CI');
  const attrs = parseAttributes(input.attributesText ?? '');
  const changes: string[] = [];
  if (input.name !== cur.name) changes.push(`ชื่อ: ${cur.name} → ${input.name}`);
  if (input.lifecycle !== cur.lifecycle) changes.push(`สถานะ: ${th.cmdb.lifecycle[cur.lifecycle]} → ${th.cmdb.lifecycle[input.lifecycle]}`);
  if (input.environment !== cur.environment) changes.push(`สภาพแวดล้อม: ${cur.environment} → ${input.environment}`);
  if ((input.ownerGroupId || null) !== cur.ownerGroupId || (input.ownerUserId || null) !== cur.ownerUserId || (input.ownerLabel || null) !== cur.ownerLabel) {
    changes.push('เปลี่ยนเจ้าของ CI');
  }
  changes.push(...diffFields((cur.attributes ?? {}) as Record<string, unknown>, attrs));

  await db.configurationItem.update({
    where: { ciId },
    data: {
      name: input.name, subtitle: input.subtitle || null, ciClass: input.ciClass, classLabel: input.classLabel || null,
      environment: input.environment, lifecycle: input.lifecycle, ownerGroupId: input.ownerGroupId || null,
      ownerUserId: input.ownerUserId || null, ownerLabel: input.ownerLabel || null, attributes: attrs,
      ...(changes.length ? { history: { create: { what: changes.join(' · '), source: `แก้ไขโดย ${await editorName(userId)}` } } } : {}),
    },
  });
}

/** ยืนยันข้อมูลด้วยมือ: อัปเดตวันที่ยืนยันและล้างข้อมูลไม่ตรง Discovery */
export async function verifyCi(ciId: string, userId: string | null) {
  const cur = await db.configurationItem.findUnique({ where: { ciId } });
  if (!cur) throw new CmdbError('ไม่พบ CI');
  await db.configurationItem.update({
    where: { ciId },
    data: {
      lastVerifiedAt: new Date(), driftNote: null,
      history: { create: { what: cur.driftNote ? `กระทบยอดและยืนยันข้อมูล (${cur.driftNote})` : 'ยืนยันข้อมูลด้วยมือ', source: `ยืนยันโดย ${await editorName(userId)}` } },
    },
  });
}

export async function addRelationship(ciId: string, targetCiId: string, type: RelationType, userId: string | null) {
  const [source, target] = await Promise.all([
    db.configurationItem.findUnique({ where: { ciId } }),
    db.configurationItem.findUnique({ where: { ciId: targetCiId } }),
  ]);
  if (!source || !target) throw new CmdbError('ไม่พบ CI');
  if (source.id === target.id) throw new CmdbError('CI ไม่สามารถมีความสัมพันธ์กับตัวเองได้');
  const rels = (await db.cIRelationship.findMany({ select: { sourceId: true, targetId: true, type: true } })) as Rel[];
  if (rels.some((r) => r.sourceId === source.id && r.targetId === target.id && r.type === type)) throw new CmdbError('มีความสัมพันธ์นี้อยู่แล้ว');
  if (type !== 'CONNECTS_TO' && wouldCreateCycle({ sourceId: source.id, targetId: target.id, type }, rels)) {
    throw new CmdbError('ความสัมพันธ์นี้ทำให้เกิดการพึ่งพาแบบวงวน');
  }
  await db.cIRelationship.create({ data: { sourceId: source.id, targetId: target.id, type } });
  await db.cIChangeLog.create({ data: { ciId: source.id, what: `เพิ่มความสัมพันธ์ ${th.cmdb.relTypes[type]} → ${target.name}`, source: `แก้ไขโดย ${await editorName(userId)}` } });
}

export async function removeRelationship(relId: string, userId: string | null) {
  const rel = await db.cIRelationship.findUnique({ where: { id: relId }, include: { source: true, target: true } });
  if (!rel) throw new CmdbError('ไม่พบความสัมพันธ์');
  await db.cIRelationship.delete({ where: { id: relId } });
  await db.cIChangeLog.create({ data: { ciId: rel.sourceId, what: `ลบความสัมพันธ์ ${th.cmdb.relTypes[rel.type]} → ${rel.target.name}`, source: `แก้ไขโดย ${await editorName(userId)}` } });
}
