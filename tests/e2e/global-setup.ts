import { execSync } from 'node:child_process';

/**
 * ล้างและ seed ฐานข้อมูลใหม่ก่อนรัน เพื่อให้ผลทดสอบทำซ้ำได้
 *  E2E_RESET=0          ข้ามการ reset
 *  E2E_RESET_CMD="..."  คำสั่ง reset ที่กำหนดเอง (CI ใช้ `npx prisma db seed` ตรง ๆ เพราะไม่มี docker compose)
 *  ค่าเริ่มต้น: seed ผ่านคอนเทนเนอร์ web ของ docker compose
 */
/** ล้างกล่องจดหมายทดสอบ (Mailpit) — ฐานข้อมูลถูก reset แล้วเลขที่เอกสารเริ่มใหม่ อีเมลรอบก่อนที่เลขซ้ำจะทำให้เทสต์ผ่าน/ล้มผิดพลาด */
async function clearMailbox() {
  const url = process.env.MAILPIT_URL ?? 'http://localhost:8025';
  try {
    await fetch(`${url}/api/v1/messages`, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
  } catch {
    // ไม่มี Mailpit = ชุดทดสอบอีเมลจะล้มเองพร้อมข้อความที่ชัดเจน ส่วนที่เหลือรันต่อได้
  }
}

export default async function globalSetup() {
  await clearMailbox();
  if (process.env.E2E_RESET === '0') return;
  const cmd = process.env.E2E_RESET_CMD ?? 'docker compose exec -T web npx prisma db seed';
  execSync(cmd, { stdio: 'pipe', cwd: process.cwd(), env: process.env });
}
