// Service Catalogue Management — กติกาตรวจข้อมูล (ฟังก์ชันบริสุทธิ์ ทดสอบได้โดยไม่ใช้ DB)

export interface ServiceInput {
  code: string;
  name: string;
  fullName: string;
  category: string;
  ownerName: string;
  slaId: string;
  sortOrder: string;
}

export interface ServiceClean {
  code: string;
  name: string;
  fullName: string | null;
  category: string | null;
  ownerName: string | null;
  slaId: string | null;
  sortOrder: number;
}

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

/** รหัสบริการ: ตัวพิมพ์ใหญ่/ตัวเลข/ขีด 2–20 ตัว (ใช้ใน URL และอ้างอิงข้ามระบบ — แก้ภายหลังไม่ได้) */
export const normalizeCode = (v: string) => v.trim().toUpperCase();
export const isValidCode = (v: string) => CODE_RE.test(v);

/** คืน error ที่อ่านเข้าใจได้ทั้งหมด (ว่าง = ผ่าน) และค่าที่ล้างแล้ว */
export function validateService(input: ServiceInput, opts: { requireCode: boolean }): { errors: string[]; clean: ServiceClean } {
  const errors: string[] = [];
  const code = normalizeCode(input.code);
  const name = input.name.trim();
  const opt = (v: string, max: number, label: string) => {
    const t = v.trim();
    if (t.length > max) errors.push(`${label}ยาวเกิน ${max} ตัวอักษร`);
    return t || null;
  };
  if (opts.requireCode && !isValidCode(code)) errors.push('รหัสบริการต้องเป็นตัวพิมพ์ใหญ่ ตัวเลข หรือขีด ความยาว 2–20 ตัว (เช่น ERP, HR-PAY)');
  if (!name) errors.push('กรุณาระบุชื่อบริการ');
  if (name.length > 100) errors.push('ชื่อบริการยาวเกิน 100 ตัวอักษร');
  const fullName = opt(input.fullName, 150, 'ชื่อเต็ม');
  const category = opt(input.category, 80, 'หมวดหมู่');
  const ownerName = opt(input.ownerName, 100, 'เจ้าของบริการ');
  const so = input.sortOrder.trim() === '' ? 0 : Number(input.sortOrder);
  if (!Number.isInteger(so) || so < 0 || so > 9999) errors.push('ลำดับแสดงต้องเป็นจำนวนเต็ม 0–9999');
  return { errors, clean: { code, name, fullName, category, ownerName, slaId: input.slaId.trim() || null, sortOrder: Number.isInteger(so) ? so : 0 } };
}

export function validateOffering(input: { name: string; description: string }): { errors: string[]; clean: { name: string; description: string | null } } {
  const errors: string[] = [];
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) errors.push('กรุณาระบุชื่อข้อเสนอบริการ');
  if (name.length > 120) errors.push('ชื่อข้อเสนอบริการยาวเกิน 120 ตัวอักษร');
  if (description.length > 400) errors.push('คำอธิบายยาวเกิน 400 ตัวอักษร');
  return { errors, clean: { name, description: description || null } };
}

export function validateCatalogItem(input: { name: string; items: string; slaText: string; sortOrder: string }): { errors: string[]; clean: { name: string; items: string; slaText: string; sortOrder: number } } {
  const errors: string[] = [];
  const name = input.name.trim();
  const items = input.items.trim();
  const slaText = input.slaText.trim();
  if (!name) errors.push('กรุณาระบุชื่อรายการ');
  if (name.length > 100) errors.push('ชื่อรายการยาวเกิน 100 ตัวอักษร');
  if (!items) errors.push('กรุณาระบุตัวอย่างสิ่งที่ขอได้ (แสดงให้ผู้ใช้เห็นในพอร์ทัล)');
  if (items.length > 200) errors.push('ตัวอย่างสิ่งที่ขอได้ยาวเกิน 200 ตัวอักษร');
  if (!slaText) errors.push('กรุณาระบุระยะเวลาส่งมอบ (เช่น ภายใน 1 วันทำการ)');
  if (slaText.length > 80) errors.push('ระยะเวลาส่งมอบยาวเกิน 80 ตัวอักษร');
  const so = input.sortOrder.trim() === '' ? 0 : Number(input.sortOrder);
  if (!Number.isInteger(so) || so < 0 || so > 9999) errors.push('ลำดับแสดงต้องเป็นจำนวนเต็ม 0–9999');
  return { errors, clean: { name, items, slaText, sortOrder: Number.isInteger(so) ? so : 0 } };
}

/** นาที → ข้อความไทย เช่น 30 นาที · 4 ชม. · 2 วัน (วัน = 24 ชม. ตามปฏิทิน 24x7) */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} นาที`;
  if (min % 1440 === 0) return `${min / 1440} วัน`;
  if (min % 60 === 0) return `${min / 60} ชม.`;
  return `${Math.floor(min / 60)} ชม. ${min % 60} นาที`;
}
