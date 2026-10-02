/**
 * session ที่ล็อกอินก่อน (หรือพร้อมกับ) การเปลี่ยน/รีเซ็ตรหัสผ่านล่าสุด ถือว่าหมดอายุ
 * เวลาทั้งสองเป็นมิลลิวินาที — ถ้าใช้ระดับวินาที การล็อกอินกับการรีเซ็ตที่เกิดในวินาทีเดียวกันจะทำให้ session เดิมรอด
 * เท่ากันถือว่าเก่า (ปฏิเสธไว้ก่อน) เพราะการล็อกอินใหม่หลังเปลี่ยนรหัสผ่านย่อมช้ากว่าเสมอ
 */
export function isSessionStale(authAtMs: number | undefined, passwordChangedAt: Date | null | undefined): boolean {
  if (!passwordChangedAt) return false;
  return (authAtMs ?? 0) <= passwordChangedAt.getTime();
}
