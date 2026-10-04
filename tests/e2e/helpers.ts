import { expect, type Browser, type Page } from '@playwright/test';

export const PASSWORD = process.env.SEED_PASSWORD ?? 'servicehub-demo';

export const USERS = {
  agent: 'somsak@servicehub.local',
  lead: 'wanna@servicehub.local',
  changeManager: 'change@servicehub.local',
  cab: 'cab@servicehub.local',
  cab2: 'cab2@servicehub.local',
  admin: 'admin@servicehub.local',
  endUser: 'employee@servicehub.local',
} as const;
export type UserKey = keyof typeof USERS;

export const authFile = (k: UserKey) => `tests/e2e/.auth/${k}.json`;

/** รอให้ React hydrate ฟอร์มแรกในหน้า (กดส่งก่อนหน้านั้นจะเป็นการ POST แบบดั้งเดิม) */
export async function waitHydrated(page: Page, selector = 'form') {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps'));
  }, selector);
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await waitHydrated(page);
  await page.getByLabel('อีเมล', { exact: true }).fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
}

/** ข้อความผิดพลาด (role=alert) ที่ server action ส่งกลับ */
export const alert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'หน้าไม่ควรเลื่อนแนวนอน').toBeLessThanOrEqual(0);
}

/** เปิดหน้าใหม่ด้วย session ของบทบาทที่ต้องการ (ใช้สลับบทบาทกลางเทสต์) */
export async function asRole(browser: Browser, role: UserKey, baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000') {
  const context = await browser.newContext({ baseURL, storageState: authFile(role), locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  const page = await context.newPage();
  return { page, context };
}

/** ตัวเลขใน text (ตัดตัวคั่นหลักพัน) */
export const num = (s: string | null) => Number((s ?? '').replace(/[^\d.]/g, ''));

/** ชื่อเดือนและปี พ.ศ. ตามเวลาไทย เช่น "ตุลาคม 2569" (offset = เลื่อนกี่เดือน) — เทสต์ไม่ผูกกับวันที่จริง */
export function monthHeading(offset = 0, now = new Date()) {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(d);
}
