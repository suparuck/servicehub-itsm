// สถิติ SLA (ฟังก์ชันบริสุทธิ์) — ใช้กับรายงาน SLA และแดชบอร์ด
export const SLA_TARGET_PCT = 95;

export interface TimerSample {
  group: string; // เช่น ชื่อบริการ หรือระดับ priority
  met: boolean;
}

export interface GroupStat {
  group: string;
  total: number;
  met: number;
  breached: number;
  /** เปอร์เซ็นต์บรรลุ SLA (ปัดทศนิยม 1 ตำแหน่ง) หรือ null ถ้าไม่มีข้อมูล */
  pct: number | null;
}

export const pct = (met: number, total: number): number | null => (total === 0 ? null : Math.round((met / total) * 1000) / 10);

/** รวมตัวอย่าง timer ที่จบแล้วตามกลุ่ม — คงลำดับตามที่พบครั้งแรก */
export function aggregate(samples: TimerSample[]): GroupStat[] {
  const map = new Map<string, { total: number; met: number }>();
  for (const s of samples) {
    const g = map.get(s.group) ?? { total: 0, met: 0 };
    g.total += 1;
    if (s.met) g.met += 1;
    map.set(s.group, g);
  }
  return [...map.entries()].map(([group, v]) => ({ group, total: v.total, met: v.met, breached: v.total - v.met, pct: pct(v.met, v.total) }));
}

export function overall(samples: TimerSample[]): GroupStat {
  const met = samples.filter((s) => s.met).length;
  return { group: '*', total: samples.length, met, breached: samples.length - met, pct: pct(met, samples.length) };
}

/** เวลาแก้ไขเฉลี่ย (นาที) จากคู่เวลาเริ่ม-จบ */
export function meanMinutes(pairs: { start: Date; end: Date }[]): number | null {
  if (pairs.length === 0) return null;
  const sum = pairs.reduce((n, p) => n + (p.end.getTime() - p.start.getTime()) / 60_000, 0);
  return sum / pairs.length;
}

/** 205 นาที → "3.4 ชม." · 40 นาที → "40 นาที" · 3000 → "2.1 วัน" */
export function formatDuration(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${Math.round(min)} นาที`;
  if (min < 24 * 60) return `${(Math.round((min / 60) * 10) / 10).toString()} ชม.`;
  return `${(Math.round((min / 1440) * 10) / 10).toString()} วัน`;
}

export const meetsTarget = (p: number | null) => p !== null && p >= SLA_TARGET_PCT;
