import type { Prisma, ReleaseStatus } from '@prisma/client';
import { th } from '@/i18n/th';
import { logAudit } from './audit';
import type { ChangeStatus } from './change';
import { db } from './db';
import { formatDocNo, parseDocNo } from './docno';
import { DomainError } from './errors';
import { assertCan, type Role } from './permissions';
import { PACKAGEABLE, canAddChange, canEditPackage, canEditPlan, canReview, validateRelMove, validateRelease, type RelFormInput, type RelStatus } from './release';

export class ReleaseError extends DomainError {}
type Actor = { id: string; role: Role };

const STATUSES: ReleaseStatus[] = ['PLANNED', 'IN_BUILD', 'READY', 'DEPLOYING', 'DEPLOYED', 'ROLLED_BACK', 'CANCELLED'];
const ACTIVE: ReleaseStatus[] = ['PLANNED', 'IN_BUILD', 'READY', 'DEPLOYING'];
const STAFF = ['AGENT', 'RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'CONFIG_MANAGER', 'ADMIN'] as const;

const include = {
  owner: { select: { id: true, name: true } },
  service: { select: { code: true, name: true } },
  changes: { select: { id: true, seq: true, title: true, type: true, status: true, windowStart: true }, orderBy: { windowStart: 'asc' as const } },
} satisfies Prisma.ReleaseInclude;

// ── ค้นหา/ดู ────────────────────────────────────────────────

export interface RelFilters {
  q?: string;
  status?: string; // active (ค่าเริ่มต้น) | all | สถานะ
}

export async function listReleases(f: RelFilters = {}) {
  const and: Prisma.ReleaseWhereInput[] = [];
  const status = f.status ?? 'active';
  if (status === 'active') and.push({ status: { in: ACTIVE } });
  else if (STATUSES.includes(status as ReleaseStatus)) and.push({ status: status as ReleaseStatus });
  const q = f.q?.trim();
  if (q) {
    const seq = parseDocNo('REL', q) ?? (/^\d+$/.test(q) ? Number(q) : null);
    and.push({ OR: [{ name: { contains: q, mode: 'insensitive' } }, { version: { contains: q, mode: 'insensitive' } }, { owner: { name: { contains: q, mode: 'insensitive' } } }, ...(seq !== null ? [{ seq }] : [])] });
  }
  return db.release.findMany({ where: and.length ? { AND: and } : {}, include: { owner: { select: { name: true } }, _count: { select: { changes: true } } }, orderBy: [{ windowStart: 'asc' }, { seq: 'desc' }] });
}

export async function releaseSummary() {
  const rows = await db.release.groupBy({ by: ['status'], _count: { _all: true } });
  const n = (s: ReleaseStatus) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { planning: n('PLANNED') + n('IN_BUILD'), ready: n('READY'), deploying: n('DEPLOYING'), deployed: n('DEPLOYED'), rolledBack: n('ROLLED_BACK'), active: ACTIVE.reduce((a, s) => a + n(s), 0) };
}

export async function getRelease(docNo: string) {
  const seq = parseDocNo('REL', docNo);
  if (seq === null) return null;
  return db.release.findUnique({ where: { seq }, include });
}

/** Change ที่เข้า Release ได้: อนุมัติ/จัดตารางแล้วและยังไม่อยู่ใน Release ใด */
export const eligibleChanges = () =>
  db.change.findMany({ where: { status: { in: PACKAGEABLE as ChangeStatus[] }, releaseId: null }, orderBy: { windowStart: 'asc' }, select: { id: true, seq: true, title: true, status: true, windowStart: true } });

export async function releaseFormOptions() {
  const [owners, services] = await Promise.all([
    db.user.findMany({ where: { active: true, role: { in: [...STAFF] } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.service.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, code: true, name: true } }),
  ]);
  return { owners, services };
}

// ── เปลี่ยนแปลง ─────────────────────────────────────────────

async function checkRefs(c: { ownerId: string | null; serviceId: string | null }) {
  if (c.ownerId && !(await db.user.findFirst({ where: { id: c.ownerId, active: true, role: { in: [...STAFF] } }, select: { id: true } }))) throw new ReleaseError('ไม่พบเจ้าของที่เลือก (ต้องเป็นเจ้าหน้าที่ที่ยังใช้งานอยู่)');
  if (c.serviceId && !(await db.service.findUnique({ where: { id: c.serviceId }, select: { id: true } }))) throw new ReleaseError('ไม่พบบริการที่เลือก');
}

export async function createRelease(actor: Actor, input: RelFormInput) {
  assertCan(actor.role, 'release.manage');
  const { errors, clean } = validateRelease(input);
  if (errors.length) throw new ReleaseError(errors.join(' · '));
  await checkRefs(clean);
  const r = await db.release.create({ data: clean });
  await logAudit('RELEASE', r.id, actor.id, `สร้าง Release “${r.name}”`);
  return r;
}

async function load(seq: number) {
  const r = await db.release.findUnique({ where: { seq }, include: { changes: { select: { id: true, seq: true, status: true } } } });
  if (!r) throw new ReleaseError('ไม่พบ Release');
  return r;
}

const asDocs = (cs: { seq: number; status: ChangeStatus }[]) => cs.map((c) => ({ docNo: formatDocNo('CHG', c.seq), status: c.status }));

export async function updateRelease(actor: Actor, seq: number, input: RelFormInput) {
  assertCan(actor.role, 'release.manage');
  const cur = await load(seq);
  if (!canEditPlan(cur.status)) throw new ReleaseError('เริ่มเปิดใช้งานแล้ว แก้ไขรายละเอียดไม่ได้');
  const { errors, clean } = validateRelease(input);
  if (errors.length) throw new ReleaseError(errors.join(' · '));
  await checkRefs(clean);
  const notes: string[] = [];
  const diff = (label: string, a: unknown, b: unknown) => {
    if ((a instanceof Date ? a.getTime() : a ?? null) !== (b instanceof Date ? b.getTime() : b ?? null)) notes.push(label);
  };
  diff('ชื่อ', cur.name, clean.name);
  diff('เวอร์ชัน', cur.version, clean.version);
  diff('คำอธิบาย', cur.description, clean.description);
  diff('เจ้าของ', cur.ownerId, clean.ownerId);
  diff('บริการ', cur.serviceId, clean.serviceId);
  diff('ช่วงเวลาเปิดใช้', cur.windowStart, clean.windowStart);
  diff('สิ้นสุดช่วงเวลา', cur.windowEnd, clean.windowEnd);
  diff('แผนการเปิดใช้', cur.deployPlan, clean.deployPlan);
  diff('แผนถอยกลับ', cur.rollbackPlan, clean.rollbackPlan);
  if (!notes.length) return;
  await db.release.update({ where: { seq }, data: clean });
  await logAudit('RELEASE', cur.id, actor.id, `แก้ไข: ${notes.join(' · ')}`);
}

/** เพิ่ม Change เข้าแพ็กเกจ — updateMany แบบมีเงื่อนไข (releaseId = null) กันสอง Release แย่ง Change เดียวกัน */
export async function addChangeToRelease(actor: Actor, seq: number, changeDocNo: string) {
  assertCan(actor.role, 'release.manage');
  const rel = await load(seq);
  if (!canEditPackage(rel.status)) throw new ReleaseError('แก้ไขแพ็กเกจได้เฉพาะช่วงวางแผนและจัดเตรียม (ย้อนกลับจาก "พร้อม" ก่อนถ้าต้องการแก้)');
  const chgSeq = parseDocNo('CHG', changeDocNo);
  const change = chgSeq === null ? null : await db.change.findUnique({ where: { seq: chgSeq }, select: { id: true, seq: true, status: true, releaseId: true } });
  if (!change) throw new ReleaseError('ไม่พบ Change ที่เลือก');
  const why = canAddChange(change, rel.id);
  if (why) throw new ReleaseError(why);
  const won = await db.change.updateMany({ where: { id: change.id, releaseId: null, status: { in: PACKAGEABLE as ChangeStatus[] } }, data: { releaseId: rel.id } });
  if (won.count !== 1) throw new ReleaseError('Change นี้ถูกเพิ่มเข้า Release อื่นหรือเปลี่ยนสถานะไปแล้ว กรุณารีเฟรช');
  await logAudit('RELEASE', rel.id, actor.id, `เพิ่ม ${formatDocNo('CHG', change.seq)} เข้าแพ็กเกจ`);
}

export async function removeChangeFromRelease(actor: Actor, seq: number, changeId: string) {
  assertCan(actor.role, 'release.manage');
  const rel = await load(seq);
  if (!canEditPackage(rel.status)) throw new ReleaseError('แก้ไขแพ็กเกจได้เฉพาะช่วงวางแผนและจัดเตรียม');
  const c = rel.changes.find((x) => x.id === changeId); // ต้องอยู่ใน Release นี้จริง — ถอด Change ของ Release อื่นผ่านพาธนี้ไม่ได้
  if (!c) throw new ReleaseError('ไม่พบ Change ในแพ็กเกจนี้');
  await db.change.update({ where: { id: c.id }, data: { releaseId: null } });
  await logAudit('RELEASE', rel.id, actor.id, `ถอด ${formatDocNo('CHG', c.seq)} ออกจากแพ็กเกจ`);
}

/** เปลี่ยนสถานะตามวงจร (ตรวจ Go/No-Go และเงื่อนไขจากข้อมูลในฐานข้อมูล ไม่ใช่ค่าจากฟอร์ม) */
export async function changeReleaseStatus(actor: Actor, seq: number, to: string, reason?: string) {
  assertCan(actor.role, 'release.manage');
  const cur = await load(seq);
  if (!STATUSES.includes(to as ReleaseStatus)) throw new ReleaseError('สถานะไม่ถูกต้อง');
  const next = to as RelStatus;
  const err = validateRelMove(cur.status, next, { release: cur, changes: asDocs(cur.changes), reason });
  if (err) throw new ReleaseError(err);
  const final = next === 'DEPLOYED' || next === 'ROLLED_BACK';
  const won = await db.release.updateMany({ where: { id: cur.id, status: cur.status }, data: { status: next, ...(final ? { completedAt: new Date() } : {}) } });
  if (won.count !== 1) throw new ReleaseError('สถานะเปลี่ยนไปแล้ว กรุณารีเฟรชแล้วลองใหม่');
  // ยกเลิก: ปล่อย Change ออกจากแพ็กเกจ ให้ไปรวมใน Release อื่นได้
  if (next === 'CANCELLED') await db.change.updateMany({ where: { releaseId: cur.id }, data: { releaseId: null } });
  await logAudit('RELEASE', cur.id, actor.id, `เปลี่ยนสถานะ: ${th.release.status[cur.status]} → ${th.release.status[next]}${reason?.trim() ? `\n${reason.trim().slice(0, 300)}` : ''}${next === 'CANCELLED' ? '\n(ปล่อย Change ออกจากแพ็กเกจแล้ว)' : ''}`);
}

export async function saveReview(actor: Actor, seq: number, text: string) {
  assertCan(actor.role, 'release.manage');
  const cur = await load(seq);
  if (!canReview(cur.status)) throw new ReleaseError('บันทึกทบทวนได้หลังเปิดใช้งานสำเร็จหรือถอยกลับแล้วเท่านั้น');
  const t = text.trim();
  if (t.length > 4000) throw new ReleaseError('บันทึกทบทวนยาวเกิน 4,000 ตัวอักษร');
  await db.release.update({ where: { seq }, data: { review: t || null } });
  await logAudit('RELEASE', cur.id, actor.id, 'บันทึกการทบทวนหลังเปิดใช้งาน (Post-implementation review)');
}

