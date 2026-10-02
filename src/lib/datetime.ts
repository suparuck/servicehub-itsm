// DB เก็บ UTC · แสดงผลเป็นเวลาไทย (Asia/Bangkok) และปี พ.ศ.
export const TZ = 'Asia/Bangkok';

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { timeZone: TZ, ...opts });

const monthShort = fmt({ month: 'short' });
const day2 = fmt({ day: '2-digit' });
const hm = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dmy = fmt({ day: '2-digit', month: '2-digit', year: '2-digit' });

export const thMonthShort = (d: Date) => monthShort.format(d);
export const thDay = (d: Date) => day2.format(d);
export const thTime = (d: Date) => hm.format(d).replace(':', ':');
export const thDateShort = (d: Date) => dmy.format(d);

/** ช่วงเวลา เช่น 22:00–23:30 (ถ้าไม่มีเวลาสิ้นสุดแสดงเวลาเริ่มอย่างเดียว) */
export function thWindow(start: Date, end?: Date | null): string {
  return end ? `${thTime(start)}–${thTime(end)}` : thTime(start);
}

/** เวลาที่เหลือ: < 24 ชม. → H:MM ชม. · มากกว่านั้น → N วัน */
export function formatRemaining(minutes: number): string {
  if (minutes <= 0) return 'เกินกำหนด';
  if (minutes >= 24 * 60) return `${Math.round(minutes / (24 * 60))} วัน`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')} ชม.`;
}

/** เที่ยงคืนวันนี้ตามเวลาไทย (เป็น UTC Date) */
export function startOfTodayBangkok(now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00+07:00`);
}
