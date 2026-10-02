// จำกัดจำนวนครั้งที่ล็อกอินผิด (ในหน่วยความจำของโปรเซสเดียว — ถ้าใช้หลายเซิร์ฟเวอร์ให้ย้ายไป Redis)
export const MAX_FAILURES = 5; // ต่อบัญชี (อีเมล)
export const MAX_FAILURES_PER_IP = 30; // ต่อไอพี — สูงกว่ามากเพราะหลายคนในสำนักงานอาจใช้ไอพีเดียวกัน (NAT)
export const WINDOW_MS = 15 * 60_000;

type Entry = { count: number; first: number };
const store = new Map<string, Entry>();

const live = (e: Entry | undefined, now: number): e is Entry => !!e && now - e.first < WINDOW_MS;

/** true = ถูกล็อกชั่วคราว */
export function isLocked(key: string, now = Date.now(), max = MAX_FAILURES): boolean {
  const e = store.get(key);
  return live(e, now) && e.count >= max;
}

export function recordFailure(key: string, now = Date.now()): void {
  const e = store.get(key);
  if (live(e, now)) e.count += 1;
  else store.set(key, { count: 1, first: now });
}

export function clearFailures(key: string): void {
  store.delete(key);
}

/** นาทีที่เหลือก่อนปลดล็อก */
export function minutesUntilUnlock(key: string, now = Date.now()): number {
  const e = store.get(key);
  return live(e, now) ? Math.ceil((WINDOW_MS - (now - e.first)) / 60_000) : 0;
}

export function resetAllForTests() {
  store.clear();
}
