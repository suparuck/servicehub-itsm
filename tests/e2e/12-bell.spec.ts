import { expect, test, type Page } from '@playwright/test';
import { asRole, authFile, waitHydrated } from './helpers';

const bell = (page: Page) => page.getByRole('button', { name: /^การแจ้งเตือน/ });
const count = (page: Page) => page.getByTestId('bell-count');

test.describe.serial('กระดิ่งแจ้งเตือนในระบบ', () => {
  test.use({ storageState: authFile('endUser') });
  let docNo = '';

  // ชุดทดสอบอื่น (เช่น 11) สร้างการแจ้งเตือนค้างไว้ — เริ่มจากยังไม่อ่านเป็นศูนย์ทุกบทบาทที่ใช้
  test.beforeAll(async ({ browser }) => {
    for (const role of ['endUser', 'lead', 'admin'] as const) {
      const { page, context } = await asRole(browser, role);
      await page.goto('/notifications');
      const all = page.getByRole('button', { name: 'อ่านทั้งหมดแล้ว' });
      if (await all.count()) {
        await waitHydrated(page, 'form');
        await all.click();
        await expect(page.getByText('ทำเครื่องหมายว่าอ่านแล้ว')).toHaveCount(0);
      }
      await context.close();
    }
  });

  test('ทุกบทบาทมีกระดิ่ง (เจ้าหน้าที่ในส่วนหัวหน้า, ผู้ใช้ในส่วนหัวพอร์ทัล) เปิด/ปิดด้วย Esc ได้', async ({ page, browser }) => {
    await page.goto('/portal');
    await expect(bell(page)).toBeVisible();
    await expect(count(page)).toHaveCount(0);
    await bell(page).click();
    const panel = page.getByRole('region', { name: 'การแจ้งเตือน' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: 'ดูการแจ้งเตือนทั้งหมด' })).toBeVisible();
    await page.keyboard.press('Escape'); // Esc ปิดกล่อง และโฟกัสกลับที่ปุ่ม
    await expect(panel).toHaveCount(0);
    await expect(bell(page)).toBeFocused();

    const staff = await asRole(browser, 'lead');
    await staff.page.goto('/incidents');
    await expect(bell(staff.page)).toBeVisible();
    await staff.context.close();
  });

  test('ผู้ใช้แจ้ง P1 → ผู้ใช้เห็นข้อความรับเรื่อง, หัวหน้าทีมเห็นเหตุวิกฤตพร้อมตัวเลขที่ยังไม่อ่าน', async ({ page, browser }) => {
    await page.goto('/portal/incident/new');
    await waitHydrated(page);
    await page.getByLabel(/ปัญหาที่พบ/).fill('E2E-BELL: ERP ล่มทั้งสาขา');
    await page.getByLabel('บริการที่เกี่ยวข้อง').selectOption({ label: 'ERP' });
    await page.getByLabel('หลายแผนกหรือหลายสาขา').check();
    await page.getByLabel('ทำงานไม่ได้เลย').check();
    await page.getByRole('button', { name: 'ส่งเรื่อง' }).click();
    await expect(page).toHaveURL(/\/portal\/my\/INC-\d+$/);
    docNo = page.url().split('/').pop()!;

    await expect(count(page)).toHaveText('1');
    await bell(page).click();
    await expect(page.getByRole('region', { name: 'การแจ้งเตือน' }).getByText(`รับเรื่องแล้ว ${docNo}`)).toBeVisible();

    const staff = await asRole(browser, 'lead');
    await staff.page.goto('/incidents');
    await expect(count(staff.page)).toHaveText('1');
    await expect(bell(staff.page)).toHaveAccessibleName('การแจ้งเตือน (ยังไม่อ่าน 1 รายการ)');
    await staff.context.close();
  });

  test('กดรายการในกระดิ่ง → ไปยังหน้างานนั้นและรายการถูกทำเครื่องหมายว่าอ่านแล้ว', async ({ browser }) => {
    const staff = await asRole(browser, 'lead');
    await staff.page.goto('/incidents');
    await waitHydrated(staff.page, 'header');
    await bell(staff.page).click();
    const item = staff.page.getByRole('link', { name: new RegExp(`เหตุวิกฤต ${docNo}`) });
    await expect(item).toBeVisible();
    await item.click();
    await expect(staff.page).toHaveURL(new RegExp(`/incidents/`));
    await expect(staff.page.getByText(docNo).first()).toBeVisible();
    await expect(count(staff.page)).toHaveCount(0); // อ่านแล้ว ตัวเลขหาย
    await staff.context.close();
  });

  test('ผู้ใช้เปิดกระดิ่ง กดรายการ → ไปหน้าติดตามเรื่องของตน', async ({ page }) => {
    await page.goto('/portal');
    await bell(page).click();
    await page.getByRole('link', { name: new RegExp(`รับเรื่องแล้ว ${docNo}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/my/${docNo}$`));
    await expect(count(page)).toHaveCount(0);
  });

  test('การแจ้งเตือนเป็นของใครของมัน: ผู้ดูแลเห็นเหตุวิกฤตของตน แต่ผู้ใช้ปลายทางไม่เห็นของผู้อื่น', async ({ page, browser }) => {
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/admin/users');
    await expect(count(admin.page)).toHaveText('1');
    await admin.context.close();

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { level: 1, name: 'การแจ้งเตือนของฉัน' })).toBeVisible();
    await expect(page.getByText(/เหตุวิกฤต/)).toHaveCount(0); // เหตุวิกฤตส่งถึงหัวหน้าทีม/ผู้ดูแลเท่านั้น
    await expect(page.getByText(`รับเรื่องแล้ว ${docNo}`)).toBeVisible();
  });

  test('หน้า /notifications: กรองเฉพาะยังไม่อ่าน และ "อ่านทั้งหมดแล้ว"', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/notifications');
    await expect(admin.page.getByText(`เหตุวิกฤต ${docNo}`)).toBeVisible();
    await admin.page.getByRole('link', { name: 'เฉพาะที่ยังไม่อ่าน' }).click();
    await expect(admin.page).toHaveURL(/unread=1/);
    await expect(admin.page.getByText(`เหตุวิกฤต ${docNo}`)).toBeVisible();
    await waitHydrated(admin.page, 'form');
    await admin.page.getByRole('button', { name: 'อ่านทั้งหมดแล้ว' }).click();
    await expect(admin.page.getByText('ยังไม่มีการแจ้งเตือน')).toBeVisible();
    await admin.page.getByRole('link', { name: 'ทั้งหมด', exact: true }).click();
    await expect(admin.page.getByText(`เหตุวิกฤต ${docNo}`)).toBeVisible(); // ยังอยู่ในรายการทั้งหมด (เป็นอ่านแล้ว)
    await admin.page.goto('/admin/users');
    await expect(count(admin.page)).toHaveCount(0);
    await admin.context.close();
  });

  test('ผู้ใช้ปิดหมวด "เรื่องที่ฉันแจ้ง" → ไม่มีรายการในกระดิ่งสำหรับเรื่องใหม่', async ({ page }) => {
    await page.goto('/account');
    await page.getByLabel(/ความคืบหน้าของเรื่องที่ฉันแจ้งหรือขอ/).uncheck();
    await page.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }).click();
    await expect(page.getByText('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')).toBeVisible();

    await page.goto('/portal/incident/new');
    await waitHydrated(page);
    await page.getByLabel(/ปัญหาที่พบ/).fill('E2E-BELL: เรื่องที่สอง');
    await page.getByRole('button', { name: 'ส่งเรื่อง' }).click();
    await expect(page).toHaveURL(/\/portal\/my\/INC-\d+$/);
    await expect(count(page)).toHaveCount(0);

    await page.goto('/account');
    await page.getByLabel(/ความคืบหน้าของเรื่องที่ฉันแจ้งหรือขอ/).check();
    await page.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }).click();
    await expect(page.getByText('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')).toBeVisible();
  });
});

test.describe('ไม่ล็อกอิน', () => {
  test('/notifications ส่งไปหน้าเข้าสู่ระบบ', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' });
    const page = await ctx.newPage();
    await page.goto('/notifications');
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});
