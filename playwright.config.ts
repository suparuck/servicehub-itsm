import { defineConfig } from '@playwright/test';

/**
 * E2E ทดสอบแอปที่รันอยู่แล้ว (docker compose up) — ค่าเริ่มต้น http://localhost:3000
 *  E2E_BASE_URL   เปลี่ยนที่อยู่แอป
 *  E2E_BROWSER    msedge (ค่าเริ่มต้น) | chrome | chromium — msedge/chrome ใช้เบราว์เซอร์ที่ติดตั้งในเครื่อง ไม่ต้องดาวน์โหลดเพิ่ม
 *  E2E_RESET=0    ไม่ล้างและ seed ฐานข้อมูลก่อนรัน (ค่าเริ่มต้นคือ reset ผ่าน docker compose)
 *  E2E_RESET_CMD  คำสั่ง reset ที่กำหนดเอง (CI ใช้ `npx prisma db seed`)
 *  CI=true        เปิด forbidOnly, retry 1 ครั้ง, รายงานแบบ GitHub, เก็บ trace เมื่อ retry
 * ข้อมูลถูกแก้ไขระหว่างทดสอบ จึงรันแบบลำดับ (workers 1) และไฟล์เรียงตามเลขนำหน้า
 */
const channel = process.env.E2E_BROWSER ?? 'msedge';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI, // กัน test.only หลุดเข้า main
  retries: isCI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: isCI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    trace: isCI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(channel === 'chromium' ? {} : { channel }),
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'e2e', testIgnore: /auth\.setup\.ts/, dependencies: ['setup'] },
  ],
});
