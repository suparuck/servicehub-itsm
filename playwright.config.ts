import { defineConfig } from '@playwright/test';

/**
 * E2E ทดสอบแอปที่รันอยู่แล้ว (docker compose up) — ค่าเริ่มต้น http://localhost:3000
 *  E2E_BASE_URL   เปลี่ยนที่อยู่แอป
 *  E2E_BROWSER    msedge (ค่าเริ่มต้น) | chrome | chromium — msedge/chrome ใช้เบราว์เซอร์ที่ติดตั้งในเครื่อง ไม่ต้องดาวน์โหลดเพิ่ม
 *  E2E_RESET=0    ไม่ล้างและ seed ฐานข้อมูลก่อนรัน (ค่าเริ่มต้นคือ reset ผ่าน docker compose)
 * ข้อมูลถูกแก้ไขระหว่างทดสอบ จึงรันแบบลำดับ (workers 1) และไฟล์เรียงตามเลขนำหน้า
 */
const channel = process.env.E2E_BROWSER ?? 'msedge';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(channel === 'chromium' ? {} : { channel }),
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'e2e', testIgnore: /auth\.setup\.ts/, dependencies: ['setup'] },
  ],
});
