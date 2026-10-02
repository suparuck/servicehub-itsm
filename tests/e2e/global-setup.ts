import { execSync } from 'node:child_process';

/**
 * ล้างและ seed ฐานข้อมูลใหม่ก่อนรัน เพื่อให้ผลทดสอบทำซ้ำได้
 *  E2E_RESET=0          ข้ามการ reset
 *  E2E_RESET_CMD="..."  คำสั่ง reset ที่กำหนดเอง (CI ใช้ `npx prisma db seed` ตรง ๆ เพราะไม่มี docker compose)
 *  ค่าเริ่มต้น: seed ผ่านคอนเทนเนอร์ web ของ docker compose
 */
export default async function globalSetup() {
  if (process.env.E2E_RESET === '0') return;
  const cmd = process.env.E2E_RESET_CMD ?? 'docker compose exec -T web npx prisma db seed';
  execSync(cmd, { stdio: 'pipe', cwd: process.cwd(), env: process.env });
}
