import { expect, test, type Page } from '@playwright/test';
import { asRole, authFile, USERS, waitHydrated } from './helpers';
import { expectNoMail, linkIn, waitForMail } from './mail';

test.describe('หน้าอีเมลของผู้ดูแล', () => {
  test('เฉพาะผู้ดูแลเห็นเมนูและเข้าหน้านี้ได้ (คนอื่น 404)', async ({ browser }) => {
    const a = await asRole(browser, 'agent');
    await a.page.goto('/');
    await expect(a.page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'อีเมลและการแจ้งเตือน' })).toHaveCount(0);
    expect((await a.page.goto('/admin/email'))?.status()).toBe(404);
    await a.context.close();

    const ad = await asRole(browser, 'admin');
    await ad.page.goto('/');
    await ad.page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'อีเมลและการแจ้งเตือน' }).click();
    await expect(ad.page.getByRole('heading', { level: 1, name: 'อีเมลและการแจ้งเตือน' })).toBeVisible();
    await expect(ad.page.getByText('การเชื่อมต่อ SMTP')).toBeVisible();
    await ad.context.close();
  });

  test('ส่งอีเมลทดสอบถึงตนเอง → ได้รับจริง และคิวแสดงสถานะ "ส่งแล้ว"', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'admin');
    await page.goto('/admin/email');
    await waitHydrated(page);
    await page.getByRole('button', { name: /ส่งอีเมลทดสอบถึงฉัน/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'อีเมลทดสอบ' })).toBeVisible();
    const mail = await waitForMail(USERS.admin, /ทดสอบการส่งอีเมล/);
    expect(mail.text).toContain('ทดสอบ');
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: 'ทดสอบการส่งอีเมล' }).first().getByText('ส่งแล้ว')).toBeVisible();
    await context.close();
  });
});

test.describe.serial('เชิญผู้ใช้ทางอีเมล และผู้ดูแลส่งลิงก์รีเซ็ต', () => {
  const email = `invite-${Date.now()}@servicehub.local`;
  const pw = 'Cedar-Lantern-8426!';
  let userUrl = '';

  test('สร้างผู้ใช้แบบเชิญ → ไม่มีรหัสชั่วคราวแสดง และมีอีเมลเชิญ', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'admin');
    await page.goto('/admin/users/new');
    await waitHydrated(page);
    await page.getByLabel('อีเมล', { exact: true }).fill(email);
    await page.getByLabel('ชื่อ-นามสกุล').fill('ทดสอบ เชิญ');
    await page.getByLabel(/ส่งอีเมลเชิญ/).check();
    await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
    await expect(page.getByText('ส่งอีเมลเชิญแล้ว')).toBeVisible();
    await expect(page.getByTestId('temp-password')).toHaveCount(0);
    userUrl = (await page.getByRole('link', { name: 'ดูผู้ใช้ที่สร้าง' }).getAttribute('href')) ?? '';
    await context.close();
  });

  test('ผู้ใช้ตั้งรหัสผ่านจากลิงก์เชิญ แล้วเข้าสู่ระบบได้', async ({ browser }) => {
    const mail = await waitForMail(email, /คุณได้รับเชิญ/);
    const link = linkIn(mail, '/reset-password?token=');
    const ctx = await browser.newContext({ locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
    const page = await ctx.newPage();
    await page.goto(link);
    await waitHydrated(page);
    await expect(page.getByRole('heading', { level: 1, name: 'ตั้งรหัสผ่านเพื่อเริ่มใช้งาน' })).toBeVisible();
    await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(pw);
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill(pw);
    await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
    await expect(page).toHaveURL(/\/login\?reason=reset/);
    await page.getByLabel('อีเมล', { exact: true }).fill(email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(pw);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await expect(page).not.toHaveURL(/login|account/);
    await ctx.close();
  });

  test('ผู้ดูแลกด "ส่งลิงก์ทางอีเมล" → ผู้ใช้ได้อีเมลจากผู้ดูแล', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'admin');
    await page.goto(userUrl);
    await waitHydrated(page);
    await page.getByRole('button', { name: 'ส่งลิงก์ทางอีเมล' }).click();
    await expect(page.getByText('ใส่คิวส่งอีเมลแล้ว')).toBeVisible();
    const mail = await waitForMail(email, /ผู้ดูแลระบบส่งลิงก์ตั้งรหัสผ่านใหม่/);
    expect(mail.html).toContain('24 ชั่วโมง');
    await context.close();
  });
});

test.describe.serial('แจ้งเตือนวงจร Incident ผ่านอีเมล', () => {
  test.use({ storageState: authFile('endUser') });
  let docNo = '';
  const reportP1 = async (page: Page, title: string) => {
    await page.goto('/portal/incident/new');
    await waitHydrated(page);
    await page.getByLabel(/ปัญหาที่พบ/).fill(title);
    await page.getByLabel('บริการที่เกี่ยวข้อง').selectOption({ label: 'ERP' });
    await page.getByLabel('หลายแผนกหรือหลายสาขา').check();
    await page.getByLabel('ทำงานไม่ได้เลย').check();
    await page.getByRole('button', { name: 'ส่งเรื่อง' }).click();
    await expect(page).toHaveURL(/\/portal\/my\/INC-\d+$/);
    return page.url().split('/').pop()!;
  };

  test('แจ้ง P1 ผ่านพอร์ทัล → ผู้แจ้งได้อีเมลรับเรื่อง, หัวหน้าทีมและผู้ดูแลได้อีเมลเหตุวิกฤต', async ({ page }) => {
    docNo = await reportP1(page, 'E2E-MAIL: ERP ล่มทั้งสาขา');
    const received = await waitForMail(USERS.endUser, new RegExp(`รับเรื่องแล้ว ${docNo}`));
    expect(linkIn(received, `/portal/my/${docNo}`)).toContain(docNo);
    for (const who of [USERS.lead, USERS.admin]) {
      const crit = await waitForMail(who, new RegExp(`เหตุวิกฤต ${docNo}`));
      expect(crit.subject).toContain('[P1 วิกฤต]');
      expect(linkIn(crit, '/incidents/')).toContain(`/incidents/${docNo}`); // ต้องเป็นเลขที่เอกสาร ไม่ใช่ id ภายใน (หน้ารายละเอียดรับเลขที่เอกสาร)
    }
  });

  test('เจ้าหน้าที่รอข้อมูลจากผู้ใช้ → ผู้ใช้ได้อีเมลอัปเดต; แก้ไขแล้ว → ได้อีเมลให้ยืนยัน', async ({ browser }) => {
    const staff = await asRole(browser, 'agent');
    await staff.page.goto(`/incidents/${docNo}`);
    await waitHydrated(staff.page);
    await staff.page.getByLabel('สถานะถัดไป').selectOption('IN_PROGRESS');
    await staff.page.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(staff.page.locator('li[aria-current="step"]')).toContainText('3. วินิจฉัย');
    await waitHydrated(staff.page);
    await staff.page.getByLabel('สถานะถัดไป').selectOption('PENDING_USER');
    await staff.page.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(staff.page.getByText('หยุดชั่วคราว')).toBeVisible();
    await waitForMail(USERS.endUser, new RegExp(`อัปเดตเรื่องของคุณ ${docNo}`));

    await staff.page.goto(`/incidents/${docNo}`);
    await waitHydrated(staff.page);
    await staff.page.getByLabel('สถานะถัดไป').selectOption('RESOLVED');
    await staff.page.getByLabel(/บันทึก \(จำเป็น/).fill('รีสตาร์ท connection pool แล้ว');
    await staff.page.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(staff.page.locator('li[aria-current="step"]')).toContainText('4. แก้ไขและกู้คืน');
    const resolved = await waitForMail(USERS.endUser, new RegExp(`แก้ไขแล้ว — โปรดยืนยัน ${docNo}`));
    expect(resolved.text).toContain('รีสตาร์ท connection pool แล้ว');
    await staff.context.close();
  });

  test('ผู้ใช้ปิดการแจ้งเตือน "เรื่องที่ฉันแจ้ง" → แจ้งเรื่องใหม่แล้วไม่ได้อีเมลรับเรื่อง (ทีมยังได้อีเมลเหตุวิกฤต)', async ({ page }) => {
    await page.goto('/account');
    const box = page.getByLabel(/ความคืบหน้าของเรื่องที่ฉันแจ้งหรือขอ/);
    await expect(box).toBeChecked();
    await expect(page.getByLabel(/งานที่มอบหมายให้ฉัน/)).toHaveCount(0); // ผู้ใช้ปลายทางเห็นหมวดเดียว
    await box.uncheck();
    await page.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }).click();
    await expect(page.getByText('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')).toBeVisible();
    await expect(page.getByLabel(/ความคืบหน้าของเรื่องที่ฉันแจ้งหรือขอ/)).not.toBeChecked();

    const second = await reportP1(page, 'E2E-MAIL: ERP ล่มอีกครั้ง');
    await waitForMail(USERS.lead, new RegExp(`เหตุวิกฤต ${second}`));
    await expectNoMail(USERS.endUser, new RegExp(`รับเรื่องแล้ว ${second}`), 4_000);

    await page.goto('/account');
    await page.getByLabel(/ความคืบหน้าของเรื่องที่ฉันแจ้งหรือขอ/).check();
    await page.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }).click();
    await expect(page.getByText('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')).toBeVisible();
  });
});
