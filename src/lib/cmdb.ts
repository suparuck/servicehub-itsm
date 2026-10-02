// ฟังก์ชันบริสุทธิ์ของ CMDB (แยกจาก DB เพื่อทดสอบได้)
export const CI_PREFIX: Record<string, string> = {
  BUSINESS_SERVICE: 'SVC',
  APPLICATION: 'APP',
  SERVER: 'SRV',
  DATABASE: 'DB',
  NETWORK_DEVICE: 'NET',
  CLOUD_RESOURCE: 'CLD',
  END_USER_DEVICE: 'EUD',
  SOFTWARE_LICENSE: 'LIC',
};

/** CI-DB-00218 จาก CI ที่มีอยู่ (เลขสูงสุดของคลาสนั้น + 1) ใช้ความกว้างตัวเลขเท่ากับของเดิม */
export function nextCiId(ciClass: string, existing: string[]): string {
  const prefix = CI_PREFIX[ciClass] ?? 'CI';
  const re = new RegExp(`^CI-${prefix}-(\\d+)$`);
  let max = 0;
  let width = 4;
  for (const id of existing) {
    const m = re.exec(id);
    if (!m) continue;
    max = Math.max(max, Number(m[1]));
    width = Math.max(width, m[1].length);
  }
  return `CI-${prefix}-${String(max + 1).padStart(width, '0')}`;
}

/** "ชื่อ: ค่า" ทีละบรรทัด → object (บรรทัดที่ไม่มี : หรือชื่อว่างจะถูกข้าม) */
export function parseAttributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

export function formatAttributes(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

/** ผลต่างของคุณลักษณะ ใช้เขียนประวัติการเปลี่ยนแปลง */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if ((before[k] ?? '') !== (after[k] ?? '')) out.push(`${k}: ${before[k] || '—'} → ${after[k] || '—'}`);
  }
  return out;
}

export function daysSince(d: Date | null | undefined, now = new Date()): number | null {
  return d ? Math.floor((now.getTime() - d.getTime()) / 86_400_000) : null;
}
