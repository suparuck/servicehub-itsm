import type { AssetStatus, CiClass, Prisma } from '@prisma/client';
import { th } from '@/i18n/th';
import { ASSET_CLASSES, canMoveStatus, isAssetClass, isLicenseClass, licenseState, nextAssetTag, supportState, validateAsset, EXPIRING_DAYS, type AssetFormInput } from './asset';
import { logAudit } from './audit';
import { db } from './db';
import { DomainError } from './errors';
import { assertCan, type Role } from './permissions';

export class AssetError extends DomainError {}
type Actor = { id: string; role: Role };

const DAY = 86_400_000;

// ── ค้นหา/ดู ────────────────────────────────────────────────

export interface AssetFilters {
  q?: string;
  cls?: string;
  status?: string;
  support?: string; // expiring | expired
  mine?: string; // userId ของผู้ถือครอง
}

const STATUSES: AssetStatus[] = ['ORDERED', 'IN_STOCK', 'IN_USE', 'IN_REPAIR', 'RETIRED'];

function whereOf(f: AssetFilters, now = new Date()): Prisma.AssetWhereInput {
  const and: Prisma.AssetWhereInput[] = [];
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { assetTag: { contains: q, mode: 'insensitive' } },
        { serialNo: { contains: q, mode: 'insensitive' } },
        { vendor: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
        { ci: { name: { contains: q, mode: 'insensitive' } } },
        { ci: { ciId: { contains: q, mode: 'insensitive' } } },
        { assignedTo: { name: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }
  if (f.cls && isAssetClass(f.cls)) and.push({ ci: { ciClass: f.cls as CiClass } });
  if (f.status && STATUSES.includes(f.status as AssetStatus)) and.push({ status: f.status as AssetStatus });
  // ใกล้หมด/หมดแล้ว ใช้ขอบเขตวันเดียวกับ supportState (เวลาไทย) — สินทรัพย์ที่ปลดระวางแล้วไม่นับ
  const dayStart = new Date(Math.floor((now.getTime() + 7 * 3_600_000) / DAY) * DAY - 7 * 3_600_000);
  if (f.support === 'expired') and.push({ status: { not: 'RETIRED' }, supportUntil: { lt: dayStart } });
  if (f.support === 'expiring') and.push({ status: { not: 'RETIRED' }, supportUntil: { gte: dayStart, lt: new Date(dayStart.getTime() + (EXPIRING_DAYS + 1) * DAY) } });
  if (f.mine) and.push({ assignedToId: f.mine });
  return and.length ? { AND: and } : {};
}

const include = { ci: { select: { ciId: true, name: true, ciClass: true, classLabel: true, lifecycle: true } }, assignedTo: { select: { id: true, name: true } } } satisfies Prisma.AssetInclude;

export async function listAssets(f: AssetFilters = {}, limit = 500) {
  return db.asset.findMany({ where: whereOf(f), include, orderBy: { assetTag: 'asc' }, take: limit });
}

export async function assetSummary(now = new Date()) {
  const [all, licenses] = await Promise.all([
    db.asset.findMany({ select: { status: true, supportUntil: true } }),
    db.asset.findMany({ where: { ci: { ciClass: 'SOFTWARE_LICENSE' }, status: { not: 'RETIRED' } }, select: { licenseQty: true, licenseUsed: true } }),
  ]);
  const by = (s: AssetStatus) => all.filter((a) => a.status === s).length;
  const active = all.filter((a) => a.status !== 'RETIRED');
  return {
    total: all.length,
    inUse: by('IN_USE'),
    inStock: by('IN_STOCK'),
    inRepair: by('IN_REPAIR'),
    expiring: active.filter((a) => supportState(a.supportUntil, now) === 'EXPIRING').length,
    expired: active.filter((a) => supportState(a.supportUntil, now) === 'EXPIRED').length,
    licenseOver: licenses.filter((l) => licenseState(l.licenseQty, l.licenseUsed) === 'OVER').length,
  };
}

export async function getAsset(tag: string) {
  return db.asset.findUnique({ where: { assetTag: tag.toUpperCase() }, include: { ...include, ci: { include: { ownerGroup: true } } } });
}

/** CI ที่เป็นฮาร์ดแวร์/ไลเซนส์และยังไม่มีสินทรัพย์ — ใช้เป็นตัวเลือกตอนรับสินทรัพย์เข้าทะเบียน */
export async function assetlessCis() {
  return db.configurationItem.findMany({
    where: { asset: null, ciClass: { in: ASSET_CLASSES as CiClass[] }, lifecycle: { not: 'RETIRED' } },
    orderBy: [{ ciClass: 'asc' }, { name: 'asc' }],
    select: { ciId: true, name: true, ciClass: true, classLabel: true },
  });
}

export async function assignableUsers() {
  return db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
}

// ── เปลี่ยนแปลง ─────────────────────────────────────────────

function fail(errors: string[]): never {
  throw new AssetError(errors.join(' · '));
}

/** รับสินทรัพย์เข้าทะเบียน: ผูกกับ CI ที่มีอยู่แล้ว (1:1) — ตั้งสถานะเริ่มต้นเป็น "ใช้งานอยู่" ถ้า CI อยู่ใน production หรือ "คลัง" ถ้าไม่ได้ระบุ */
export async function createAsset(actor: Actor, ciId: string, input: AssetFormInput & { status: string }) {
  assertCan(actor.role, 'asset.manage');
  const ci = await db.configurationItem.findUnique({ where: { ciId }, include: { asset: true } });
  if (!ci) throw new AssetError('ไม่พบ CI ที่เลือก');
  if (!isAssetClass(ci.ciClass)) throw new AssetError('CI คลาสนี้ไม่ใช่ฮาร์ดแวร์หรือไลเซนส์ จึงขึ้นทะเบียนเป็นสินทรัพย์ไม่ได้');
  if (ci.asset) throw new AssetError(`CI นี้มีสินทรัพย์อยู่แล้ว (${ci.asset.assetTag})`);
  if (ci.lifecycle === 'RETIRED') throw new AssetError('CI นี้ปลดระวางแล้ว');
  const status = (['ORDERED', 'IN_STOCK', 'IN_USE'] as AssetStatus[]).find((s) => s === input.status);
  if (!status) throw new AssetError('สถานะเริ่มต้นต้องเป็น สั่งซื้อ/ในคลัง/ใช้งานอยู่');
  const { errors, clean } = validateAsset(input, ci.ciClass);
  if (errors.length) fail(errors);

  // เลขแท็กคำนวณจากเลขสูงสุด + ลองซ้ำเมื่อชนกัน (unique) — สองคนรับเข้าพร้อมกันได้เลขต่างกัน
  for (let attempt = 0; attempt < 5; attempt++) {
    const tags = (await db.asset.findMany({ where: { assetTag: { startsWith: 'ASSET-' } }, select: { assetTag: true } })).map((a) => a.assetTag);
    const assetTag = nextAssetTag(ci.ciClass as never, tags);
    try {
      const a = await db.asset.create({ data: { assetTag, ciId: ci.id, status, ...clean } });
      await logAudit('ASSET', a.id, actor.id, `รับสินทรัพย์เข้าทะเบียน ${assetTag} (${ci.name}) สถานะ ${th.asset.status[status]}`);
      return a;
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      if (await db.asset.findUnique({ where: { ciId: ci.id } })) throw new AssetError('CI นี้เพิ่งถูกขึ้นทะเบียนโดยผู้อื่น');
    }
  }
  throw new AssetError('สร้างเลขแท็กไม่สำเร็จ กรุณาลองอีกครั้ง');
}

export async function updateAsset(actor: Actor, tag: string, input: AssetFormInput) {
  assertCan(actor.role, 'asset.manage');
  const cur = await db.asset.findUnique({ where: { assetTag: tag }, include: { ci: { select: { ciClass: true } } } });
  if (!cur) throw new AssetError('ไม่พบสินทรัพย์');
  if (cur.status === 'RETIRED') throw new AssetError('สินทรัพย์ที่ปลดระวางแล้วแก้ไขไม่ได้');
  const { errors, clean } = validateAsset(input, cur.ci.ciClass);
  if (errors.length) fail(errors);
  const changes: string[] = [];
  const diff = (label: string, a: unknown, b: unknown) => {
    const fa = a instanceof Date ? a.getTime() : a ?? null;
    const fb = b instanceof Date ? b.getTime() : b ?? null;
    if (fa !== fb) changes.push(`${label}: ${a instanceof Date ? a.toISOString().slice(0, 10) : a ?? '—'} → ${b instanceof Date ? b.toISOString().slice(0, 10) : b ?? '—'}`);
  };
  diff('ผู้ขาย', cur.vendor, clean.vendor);
  diff('Serial', cur.serialNo, clean.serialNo);
  diff('สถานที่', cur.location, clean.location);
  diff('มูลค่า', cur.costBaht, clean.costBaht);
  diff('วันที่ซื้อ', cur.purchasedAt, clean.purchasedAt);
  diff('สิ้นสุดประกัน/ไลเซนส์', cur.supportUntil, clean.supportUntil);
  diff('สิทธิ์ที่ซื้อ', cur.licenseQty, clean.licenseQty);
  diff('สิทธิ์ที่ใช้', cur.licenseUsed, clean.licenseUsed);
  if (!changes.length) return;
  await db.asset.update({ where: { assetTag: tag }, data: clean });
  await logAudit('ASSET', cur.id, actor.id, `แก้ไขข้อมูลสินทรัพย์\n${changes.join('\n')}`);
}

/**
 * เปลี่ยนสถานะ (ตามวงจรชีวิต) — "ใช้งานอยู่" ของอุปกรณ์ต้องระบุผู้ถือครอง; ออกจากสถานะนั้นแล้วล้างผู้ถือครอง
 * ปลดระวาง: ปรับ CI ใน CMDB เป็น RETIRED ด้วย เพื่อให้ทะเบียนสองที่ไม่ขัดกัน
 */
export async function changeAssetStatus(actor: Actor, tag: string, to: string, opts: { assigneeId?: string; note?: string } = {}) {
  assertCan(actor.role, 'asset.manage');
  const cur = await db.asset.findUnique({ where: { assetTag: tag }, include: { ci: true, assignedTo: true } });
  if (!cur) throw new AssetError('ไม่พบสินทรัพย์');
  if (!STATUSES.includes(to as AssetStatus)) throw new AssetError('สถานะไม่ถูกต้อง');
  const next = to as AssetStatus;
  if (!canMoveStatus(cur.status, next)) throw new AssetError(`เปลี่ยนจาก ${th.asset.status[cur.status]} เป็น ${th.asset.status[next]} ไม่ได้`);
  const device = !isLicenseClass(cur.ci.ciClass);
  let assignee: { id: string; name: string } | null = null;
  if (next === 'IN_USE' && device && opts.assigneeId) {
    assignee = await db.user.findFirst({ where: { id: opts.assigneeId, active: true }, select: { id: true, name: true } });
    if (!assignee) throw new AssetError('ไม่พบผู้ถือครองที่เลือก หรือบัญชีถูกปิดแล้ว');
  }
  if (next === 'IN_USE' && device && !assignee && cur.ci.ciClass === 'END_USER_DEVICE') throw new AssetError('อุปกรณ์ผู้ใช้ที่เปลี่ยนเป็นใช้งานอยู่ต้องระบุผู้ถือครอง');
  const now = new Date();
  const keepsHolder = next === 'IN_USE' || next === 'IN_REPAIR'; // ส่งซ่อมยังเป็นของผู้ถือครองเดิม
  const holderId = next === 'IN_USE' ? assignee?.id ?? null : keepsHolder ? cur.assignedToId : null;
  const text = [`เปลี่ยนสถานะ: ${th.asset.status[cur.status]} → ${th.asset.status[next]}`];
  if (assignee) text.push(`ผู้ถือครอง: ${assignee.name}`);
  else if (cur.assignedTo && !keepsHolder) text.push(`คืนจาก ${cur.assignedTo.name}`);
  if (opts.note?.trim()) text.push(opts.note.trim().slice(0, 300));

  await db.$transaction(async (tx) => {
    await tx.asset.update({
      where: { assetTag: tag },
      data: { status: next, assignedToId: holderId, assignedAt: next === 'IN_USE' && assignee ? now : holderId ? cur.assignedAt : null },
    });
    if (next === 'RETIRED' && cur.ci.lifecycle !== 'RETIRED') {
      await tx.configurationItem.update({ where: { id: cur.ciId }, data: { lifecycle: 'RETIRED', history: { create: { what: `สถานะ: ${th.cmdb.lifecycle[cur.ci.lifecycle]} → ${th.cmdb.lifecycle.RETIRED}`, source: `ปลดระวางสินทรัพย์ ${tag}` } } } });
    }
    await logAudit('ASSET', cur.id, actor.id, text.join('\n'), tx);
  });
}

/** สรุปข้อมูลสำหรับ CSV — จำกัดเฉพาะผู้ที่มีสิทธิ์ดูทะเบียน (route ตรวจสิทธิ์แล้ว) */
export async function assetsForExport(f: AssetFilters = {}) {
  return listAssets(f, 5000);
}
