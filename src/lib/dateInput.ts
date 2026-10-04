/** 'YYYY-MM-DD' จากช่องวันที่ → 00:00 เวลาไทย · ว่าง → ล้างค่า (date: null) · รูปแบบผิด/วันที่ไม่มีจริง (เช่น 2026-02-30) → error */
export function parseBkkDate(v: string): { date: Date | null } | { error: string } {
  const s = v.trim();
  if (!s) return { date: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: 'รูปแบบวันที่ไม่ถูกต้อง' };
  const d = new Date(`${s}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime()) || new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10) !== s) return { error: 'วันที่ไม่ถูกต้อง' };
  return { date: d };
}
