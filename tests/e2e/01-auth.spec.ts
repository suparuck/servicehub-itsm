import { expect, test } from '@playwright/test';
import { PASSWORD, USERS, alert, authFile, login, waitHydrated } from './helpers';

const anon = { storageState: { cookies: [], origins: [] } };

test.describe('การล็อกอิน (ยังไม่มี session)', () => {
  test.use(anon);

  test('ยังไม่ล็อกอิน → ถูกส่งไป /login พร้อม callbackUrl', async ({ page }) => {
    await page.goto('/incidents');
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    await expect(page.getByRole('heading', { name: 'ServiceHub' })).toBeVisible();
    await expect(page.getByLabel('อีเมล')).toBeVisible();
    await expect(page.getByLabel('รหัสผ่าน')).toBeVisible();
  });

  test('รหัสผ่านผิด → แจ้งข้อความกลาง ๆ และไม่ล้างอีเมล', async ({ page }) => {
    await login(page, USERS.agent, 'ผิดแน่นอน');
    await expect(alert(page)).toHaveText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    await expect(page.getByLabel('อีเมล')).toHaveValue(USERS.agent);
    await expect(page).toHaveURL(/\/login/);
  });

  test('อีเมลที่ไม่มีในระบบได้ข้อความเดียวกัน (ไม่เปิดเผยว่าบัญชีมีอยู่)', async ({ page }) => {
    await login(page, 'nobody@servicehub.local', PASSWORD);
    await expect(alert(page)).toHaveText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  test('ล็อกอินแล้วกลับไปหน้าที่ตั้งใจเข้า (deep link)', async ({ page }) => {
    await page.goto('/changes?view=calendar');
    await waitHydrated(page);
    await page.getByLabel('อีเมล').fill(USERS.agent);
    await page.getByLabel('รหัสผ่าน').fill(PASSWORD);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await expect(page).toHaveURL(/\/changes\?view=calendar$/);
    await expect(page.getByRole('heading', { name: /ตุลาคม 2569/ })).toBeVisible();
  });

  test('callbackUrl ไปเว็บอื่นไม่ได้ (กัน open redirect)', async ({ page }) => {
    await page.goto('/login?callbackUrl=' + encodeURIComponent('https://evil.example/phish'));
    await waitHydrated(page);
    await page.getByLabel('อีเมล').fill(USERS.agent);
    await page.getByLabel('รหัสผ่าน').fill(PASSWORD);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await page.waitForURL((u) => u.pathname !== '/login');
    expect(new URL(page.url()).hostname).toBe('localhost');
  });

  test('ผู้ใช้ปลายทางล็อกอินแล้วเข้าพอร์ทัลโดยตรง', async ({ page }) => {
    await login(page, USERS.endUser);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole('heading', { name: 'ต้องการความช่วยเหลือเรื่องอะไร?' })).toBeVisible();
  });

  test('ออกจากระบบแล้วเข้าหน้าภายในไม่ได้อีก', async ({ page }) => {
    await login(page, USERS.agent);
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/cmdb');
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
  });
});

test.describe('จำกัดจำนวนครั้งที่ล็อกอินผิด', () => {
  // ไอพีสมมติเฉพาะเทสต์นี้ เพื่อไม่ให้ตัวนับต่อไอพีกระทบเทสต์อื่น
  test.use({ ...anon, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.77' } });

  test('ผิดครบ 5 ครั้งถูกล็อกชั่วคราว', async ({ page }) => {
    const email = `lockout-${Date.now()}@example.test`;
    await page.goto('/login');
    await waitHydrated(page);
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('อีเมล').fill(email);
      await page.getByLabel('รหัสผ่าน').fill(`ผิด${i}`);
      await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
      await expect(alert(page)).toHaveText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeEnabled();
    }
    await page.getByLabel('รหัสผ่าน').fill('ผิด-ครั้งที่-6');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await expect(alert(page)).toContainText('ลองผิดหลายครั้งเกินไป');
  });
});

test.describe('ผู้ใช้ปลายทางเข้าหน้าเจ้าหน้าที่ไม่ได้', () => {
  test.use({ storageState: authFile('endUser') });

  for (const path of ['/', '/incidents', '/cmdb', '/changes', '/sla', '/knowledge']) {
    test(`${path} → /portal`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/portal$/);
    });
  }
});
