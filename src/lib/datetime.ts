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

const dateLong = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
/** 2 ต.ค. 2569 14:58 น. */
export const thDateTime = (d: Date) => `${dateLong.format(d)} ${thTime(d)} น.`;

const dm = fmt({ day: '2-digit', month: '2-digit' });
/** 02/10 03:00 (วัน/เดือน เวลา — ใช้ในตารางที่พื้นที่จำกัด) */
export const thDayMonthTime = (d: Date) => `${dm.format(d)} ${thTime(d)}`;
/** 18 ก.ย. 2569 */
export const thDate = (d: Date) => dateLong.format(d);

/** ค่าสำหรับ <input type="datetime-local"> เป็นเวลาไทย (YYYY-MM-DDTHH:mm) */
export const toBangkokInput = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
/** แปลงค่าจาก datetime-local (ถือเป็นเวลาไทย) เป็น UTC Date — ค่าว่างหรือผิดรูปแบบคืน null */
export function fromBangkokInput(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
