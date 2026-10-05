import { expect, test, type Page } from '@playwright/test';
import { alert, asRole, authFile, USERS, waitHydrated } from './helpers';
import { expectNoMail, waitForMail } from './mail';

const ymdAt = (days: number) => new Date(Date.now() + 7 * 3600e3 + days * 86400e3).toISOString().slice(0, 10);

async function setDays(page: Page, value: string) {
  await page.goto('/admin/alerts');
  await waitHydrated(page);
  await page.getByLabel(/^แจ้งเตือนเมื่อเหลือ/).fill(value);
  await page.getByRole('button', { name: 'บันทึกเกณฑ์' }).click();
}

test.describe.serial('เกณฑ์วันแจ้งเตือนที่ตั้งได้', () => {
  test.use({ storageState: authFile('admin') });
  let fields: Record<string, string> = {};
  let tag = '';

  test('เมนูผู้ดูแลมีหน้านี้ และเริ่มต้นเป็น 90, 30, 7 (ค่าเริ่มต้น) โดยไม่มีปุ่มคืนค่า', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'เกณฑ์การแจ้งเตือน' }).click();
    await expect(page).toHaveURL(/\/admin\/alerts$/);
    await expect(page.getByRole('heading', { level: 1, name: 'เกณฑ์การแจ้งเตือน' })).toBeVisible();
    await expect(page.getByTestId('current')).toContainText('90, 30, 7 วัน');
    await expect(page.getByTestId('current')).toContainText('(ค่าเริ่มต้น)');
    await expect(page.getByTestId('preview')).toContainText('≤ 90 / ≤ 30 / ≤ 7 วัน');
    await expect(page.getByRole('button', { name: /คืนค่าเริ่มต้น/ })).toHaveCount(0);
  });

  test('ค่าที่ไม่ถูกต้องถูกปฏิเสธพร้อมเหตุผล และค่าเดิมไม่เปลี่ยน', async ({ page }) => {
    // เก็บฟิลด์ของฟอร์มบันทึกไว้ใช้ในเคสปลอม request (ก่อน hydrate เหมือน 07-permissions)
    await page.goto('/admin/alerts');
    fields = await page.evaluate(() => {
      const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('input[name=days]'))!;
      return Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((i) => [i.name, i.value]));
    });
    expect(Object.keys(fields).length, 'ต้องมีฟิลด์ $ACTION_* ของฟอร์ม').toBeGreaterThan(0);
    for (const [bad, msg] of [['abc', 'ไม่ใช่จำนวนเต็มวัน'], ['0', 'ระหว่าง 1 ถึง 365'], ['400', 'ระหว่าง 1 ถึง 365'], ['1,2,3,4,5,6', 'ไม่เกิน 5 ค่า'], ['30.5', 'ไม่ใช่จำนวนเต็มวัน']] as const) {
      await setDays(page, bad);
      await expect(alert(page), bad).toContainText(msg);
    }
    await page.goto('/admin/alerts');
    await expect(page.getByTestId('current')).toContainText('90, 30, 7 วัน');
  });

  test('Server Action ปลอม: เจ้าหน้าที่ทั่วไป POST ฟอร์มของผู้ดูแล → ไม่มีผล (เคสควบคุม: ผู้ดูแล POST แล้วสำเร็จ)', async ({ browser }) => {
    const multipart = { ...fields, days: '45' };
    const agent = await asRole(browser, 'agent');
    await agent.page.request.post('/admin/alerts', { multipart, maxRedirects: 0, failOnStatusCode: false });
    await agent.context.close();
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/admin/alerts');
    await expect(admin.page.getByTestId('current')).toContainText('90, 30, 7 วัน'); // ยังเป็นค่าเดิม
    const res = await admin.page.request.post('/admin/alerts', { multipart, maxRedirects: 0, failOnStatusCode: false });
    expect(res.status(), 'ฟอร์มที่ปลอมต้องใช้งานได้เมื่อผู้เรียกมีสิทธิ์').toBe(303);
    await admin.page.goto('/admin/alerts');
    await expect(admin.page.getByTestId('current')).toContainText('45 วัน');
    await admin.context.close();
  });

  test('ตั้งเป็น 60, 14 → บันทึกสำเร็จ แสดงตัวอย่าง ปุ่มคืนค่าเริ่มต้น และประวัติการเปลี่ยน', async ({ page }) => {
    await setDays(page, ' 14 ; 60 ');
    await expect(page.getByRole('status').filter({ hasText: 'บันทึกเกณฑ์การแจ้งเตือนแล้ว' })).toBeVisible();
    await expect(page.getByTestId('current')).toContainText('60, 14 วัน');
    await expect(page.getByTestId('current')).not.toContainText('(ค่าเริ่มต้น)');
    await expect(page.getByTestId('preview')).toContainText('≤ 60 / ≤ 14 วัน');
    await expect(page.getByRole('button', { name: /คืนค่าเริ่มต้น/ })).toBeVisible();
    await expect(page.getByText(/45 → 60, 14 วัน/)).toBeVisible();
  });

  test('ผลต่อสินทรัพย์: กรอบ "ใกล้หมด" เป็น ≤ 60 วัน และสินทรัพย์ที่เหลือ 75 วันไม่ถูกแจ้ง/ไม่ติดป้ายใกล้หมด', async ({ page }) => {
    await page.goto('/assets');
    await expect(page.getByLabel('ประกัน/ไลเซนส์').locator('option', { hasText: 'ใกล้หมด (≤ 60 วัน)' })).toHaveCount(1);

    await page.goto('/cmdb/new');
    await waitHydrated(page);
    await page.getByLabel(/ชื่อ CI/).fill('E2E-THRESH-NB');
    await page.getByLabel('คลาส').selectOption('END_USER_DEVICE');
    await page.getByRole('button', { name: 'เพิ่ม CI' }).click();
    await expect(page).toHaveURL(/\/cmdb\/CI-EUD-\d+$/);
    await page.goto('/assets/new');
    await waitHydrated(page);
    const select = page.getByLabel(/CI ที่จะขึ้นทะเบียน/);
    await select.selectOption((await select.locator('option', { hasText: 'E2E-THRESH-NB' }).getAttribute('value'))!);
    await page.getByLabel(/สิ้นสุดประกัน\/MA/).fill(ymdAt(75));
    await page.getByRole('button', { name: 'รับเข้าทะเบียน' }).click();
    await expect(page).toHaveURL(/\/assets\/ASSET-EUD-\d{4}$/);
    tag = page.url().split('/').pop()!;
    await expect(page.getByText(/ใช้ได้ · ถึง/)).toBeVisible(); // 75 วัน > 60 → ยังไม่ใกล้หมด
    await expectNoMail(USERS.admin, new RegExp(tag), 5_000); // เกณฑ์ไกลสุด 60 วัน → ยังไม่แจ้ง
  });

  test('คืนค่าเริ่มต้น → 90, 30, 7 และสินทรัพย์ 75 วันกลายเป็น "ใกล้หมด" พร้อมแจ้งเตือนเมื่อตรวจครั้งถัดไป', async ({ page }) => {
    await page.goto('/admin/alerts');
    await waitHydrated(page);
    await page.getByRole('button', { name: /คืนค่าเริ่มต้น/ }).click();
    await expect(page.getByTestId('current')).toContainText('90, 30, 7 วัน');
    await expect(page.getByTestId('current')).toContainText('(ค่าเริ่มต้น)');
    await expect(page.getByText(/คืนเกณฑ์วันแจ้งเตือนเป็นค่าเริ่มต้น/)).toBeVisible();

    await page.goto(`/assets/${tag}`);
    await expect(page.getByText(/ใกล้หมด · ถึง/)).toBeVisible();
    await waitHydrated(page);
    await page.getByLabel('สถานที่').fill('คลังชั้น 3'); // แก้ไข → ตรวจแจ้งเตือนทันที
    await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()]);
    await waitForMail(USERS.admin, new RegExp(`ประกัน/สัญญา MAใกล้หมด \\(อีก 75 วัน\\).*${tag}`));
  });

  test('เจ้าหน้าที่ทั่วไป หัวหน้าทีม และผู้จัดการ CMDB เข้าหน้านี้ไม่ได้ (404) และไม่เห็นเมนู', async ({ browser }) => {
    for (const role of ['agent', 'lead', 'cab'] as const) {
      const r = await asRole(browser, role);
      await r.page.goto('/');
      await expect(r.page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'เกณฑ์การแจ้งเตือน' })).toHaveCount(0);
      expect((await r.page.goto('/admin/alerts'))?.status(), role).toBe(404);
      await r.context.close();
    }
    const user = await asRole(browser, 'endUser');
    await user.page.goto('/admin/alerts');
    await expect(user.page).toHaveURL(/\/portal$/);
    await user.context.close();
  });
});
