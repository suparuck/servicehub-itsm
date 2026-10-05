// Release Management — กติกา (ฟังก์ชันบริสุทธิ์ ทดสอบได้โดยไม่ใช้ DB)
import type { ChangeStatus } from './change';

export type RelStatus = 'PLANNED' | 'IN_BUILD' | 'READY' | 'DEPLOYING' | 'DEPLOYED' | 'ROLLED_BACK' | 'CANCELLED';
export const REL_FLOW: RelStatus[] = ['PLANNED', 'IN_BUILD', 'READY', 'DEPLOYING', 'DEPLOYED'];
export const isFinalRel = (s: RelStatus) => s === 'DEPLOYED' || s === 'ROLLED_BACK' || s === 'CANCELLED';

const NEXT: Record<RelStatus, RelStatus[]> = {
  PLANNED: ['IN_BUILD', 'CANCELLED'],
  IN_BUILD: ['READY', 'PLANNED', 'CANCELLED'],
  READY: ['DEPLOYING', 'IN_BUILD', 'CANCELLED'],
  DEPLOYING: ['DEPLOYED', 'ROLLED_BACK'],
  DEPLOYED: [],
  ROLLED_BACK: [],
  CANCELLED: [],
};
export const nextRelStatuses = (s: RelStatus) => NEXT[s];
export const canMoveRel = (from: RelStatus, to: RelStatus) => NEXT[from].includes(to);

/** แก้ไขขอบเขต (เพิ่ม/ถอด Change) ได้เฉพาะช่วงวางแผน/จัดเตรียม — พร้อมแล้ว (READY) ต้องย้อนกลับก่อนจึงแก้ได้ เพื่อไม่ให้ขอบเขตเปลี่ยนหลังตัดสิน Go */
export const canEditPackage = (s: RelStatus) => s === 'PLANNED' || s === 'IN_BUILD';
/** แก้ไขรายละเอียด/แผนได้จนกว่าจะเริ่มเปิดใช้ */
export const canEditPlan = (s: RelStatus) => s === 'PLANNED' || s === 'IN_BUILD' || s === 'READY';
/** บันทึกทบทวนหลังเปิดใช้ได้เมื่อจบแล้วด้วยการเปิดใช้หรือถอยกลับ */
export const canReview = (s: RelStatus) => s === 'DEPLOYED' || s === 'ROLLED_BACK';

// ── Change ที่เข้า Release ได้ ──
/** อนุมัติแล้วและยังไม่เริ่มดำเนินการ (หรือกำลังดำเนินการ/เสร็จแล้วในกรณีรวบรวมย้อนหลังไม่รองรับ) — ต้องผ่านการอนุมัติก่อนเข้าแพ็กเกจ */
export const PACKAGEABLE: ChangeStatus[] = ['APPROVED', 'SCHEDULED'];
export function canAddChange(change: { status: ChangeStatus; releaseId: string | null }, releaseId: string): string | null {
  if (change.releaseId === releaseId) return 'Change นี้อยู่ใน Release นี้แล้ว';
  if (change.releaseId) return 'Change นี้อยู่ใน Release อื่นแล้ว (ถอดออกจากรายการนั้นก่อน)';
  if (!PACKAGEABLE.includes(change.status)) return 'เข้า Release ได้เฉพาะ Change ที่อนุมัติแล้ว (อนุมัติ/จัดตารางแล้ว)';
  return null;
}

// ── เกณฑ์ Go / No-Go ──
export interface ReleaseLike {
  ownerId: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  deployPlan: string | null;
  rollbackPlan: string | null;
}

export interface GoItem {
  key: 'changes' | 'approved' | 'owner' | 'window' | 'deployPlan' | 'rollbackPlan';
  ok: boolean;
  detail?: string;
}

const has = (v: string | null | undefined) => !!v?.trim();
const OK_FOR_GO: ChangeStatus[] = ['APPROVED', 'SCHEDULED', 'IMPLEMENTING', 'COMPLETED'];

/** รายการตรวจความพร้อม — ทุกข้อต้องผ่านก่อนเป็น READY; แสดงให้ผู้ตัดสินเห็นว่าข้อไหนไม่ผ่านและเพราะอะไร */
export function goNoGo(r: ReleaseLike, changes: { docNo: string; status: ChangeStatus }[]): GoItem[] {
  const bad = changes.filter((c) => !OK_FOR_GO.includes(c.status));
  return [
    { key: 'changes', ok: changes.length > 0 },
    { key: 'approved', ok: changes.length > 0 && bad.length === 0, detail: bad.length ? bad.map((c) => c.docNo).join(', ') : undefined },
    { key: 'owner', ok: !!r.ownerId },
    { key: 'window', ok: !!r.windowStart && !!r.windowEnd && r.windowEnd.getTime() > r.windowStart.getTime() },
    { key: 'deployPlan', ok: has(r.deployPlan) },
    { key: 'rollbackPlan', ok: has(r.rollbackPlan) },
  ];
}
export const goReady = (items: GoItem[]) => items.every((i) => i.ok);

/**
 * ตรวจการย้ายสถานะ: READY ต้องผ่าน Go/No-Go · เริ่มเปิดใช้ (DEPLOYING) ต้องตรวจซ้ำ (Change อาจถูกยกเลิกหลังตัดสินใจ) ·
 * DEPLOYED ต้องให้ทุก Change ในแพ็กเกจ "เสร็จสิ้น" แล้ว · ถอยกลับ/ยกเลิก/ย้อนกลับต้องระบุเหตุผล
 */
export function validateRelMove(from: RelStatus, to: RelStatus, ctx: { release: ReleaseLike; changes: { docNo: string; status: ChangeStatus }[]; reason?: string | null }): string | null {
  if (!canMoveRel(from, to)) return 'เปลี่ยนสถานะนี้ไม่ได้ในสถานะปัจจุบัน';
  if ((to === 'ROLLED_BACK' || to === 'CANCELLED' || (from === 'READY' && to === 'IN_BUILD') || (from === 'IN_BUILD' && to === 'PLANNED')) && !has(ctx.reason)) return 'ต้องระบุเหตุผล';
  if (to === 'READY' || to === 'DEPLOYING') {
    const failed = goNoGo(ctx.release, ctx.changes).filter((i) => !i.ok);
    if (failed.length) return `ยังไม่ผ่านเกณฑ์ Go/No-Go: ${failed.map((f) => GO_LABEL[f.key]).join(' · ')}`;
  }
  if (to === 'DEPLOYED') {
    const pending = ctx.changes.filter((c) => c.status !== 'COMPLETED');
    if (pending.length) return `ยังมี Change ที่ไม่เสร็จสิ้น: ${pending.map((c) => c.docNo).join(', ')} (ต้องเสร็จสิ้นทั้งหมด หรือถอดออกก่อน)`;
  }
  return null;
}

export const GO_LABEL: Record<GoItem['key'], string> = {
  changes: 'มี Change ในแพ็กเกจอย่างน้อย 1 รายการ',
  approved: 'ทุก Change ผ่านการอนุมัติแล้ว',
  owner: 'ระบุเจ้าของ Release',
  window: 'กำหนดช่วงเวลาเปิดใช้ (เริ่ม-สิ้นสุด)',
  deployPlan: 'มีแผนการเปิดใช้ (Deployment plan)',
  rollbackPlan: 'มีแผนถอยกลับ (Rollback plan)',
};

// ── ฟอร์ม ──
export interface RelFormInput {
  name: string;
  version: string;
  description: string;
  ownerId: string;
  serviceId: string;
  windowStart: string; // datetime-local (เวลาไทย)
  windowEnd: string;
  deployPlan: string;
  rollbackPlan: string;
}

export interface RelClean {
  name: string;
  version: string | null;
  description: string | null;
  ownerId: string | null;
  serviceId: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  deployPlan: string | null;
  rollbackPlan: string | null;
}

/** datetime-local (YYYY-MM-DDTHH:mm เวลาไทย) → Date; ว่าง → null; ผิดรูปแบบ/ไม่มีจริง → undefined */
export function parseBkkDateTime(v: string): Date | null | undefined {
  const s = v.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}:00+07:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  // วันที่ไม่มีจริง (เช่น 02-30) ถูก Date ปัดเป็นวันถัดไป — ตรวจย้อนกลับ
  const back = new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
  return back === s ? d : undefined;
}

export function validateRelease(i: RelFormInput): { errors: string[]; clean: RelClean } {
  const errors: string[] = [];
  const name = i.name.trim();
  if (!name) errors.push('กรุณาระบุชื่อ Release');
  if (name.length > 150) errors.push('ชื่อ Release ยาวเกิน 150 ตัวอักษร');
  const version = i.version.trim();
  if (version.length > 40) errors.push('เวอร์ชันยาวเกิน 40 ตัวอักษร');
  const long = (v: string, label: string) => {
    const t = v.trim();
    if (t.length > 4000) errors.push(`${label}ยาวเกิน 4,000 ตัวอักษร`);
    return t || null;
  };
  const description = long(i.description, 'คำอธิบาย');
  const deployPlan = long(i.deployPlan, 'แผนการเปิดใช้');
  const rollbackPlan = long(i.rollbackPlan, 'แผนถอยกลับ');
  const ws = parseBkkDateTime(i.windowStart);
  const we = parseBkkDateTime(i.windowEnd);
  if (ws === undefined) errors.push('เวลาเริ่มเปิดใช้ไม่ถูกต้อง');
  if (we === undefined) errors.push('เวลาสิ้นสุดไม่ถูกต้อง');
  if (ws && we && we.getTime() <= ws.getTime()) errors.push('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
  if ((ws && !we) || (!ws && we)) errors.push('ต้องระบุเวลาเริ่มและสิ้นสุดคู่กัน');
  return {
    errors,
    clean: {
      name, version: version || null, description, ownerId: i.ownerId.trim() || null, serviceId: i.serviceId.trim() || null,
      windowStart: ws ?? null, windowEnd: we ?? null, deployPlan, rollbackPlan,
    },
  };
}

