import { execSync } from 'node:child_process';

/** ล้างและ seed ฐานข้อมูลใหม่ก่อนรัน เพื่อให้ผลทดสอบทำซ้ำได้ (ข้ามได้ด้วย E2E_RESET=0) */
export default async function globalSetup() {
  if (process.env.E2E_RESET === '0') return;
  execSync('docker compose exec -T web npx prisma db seed', { stdio: 'pipe', cwd: process.cwd() });
}
