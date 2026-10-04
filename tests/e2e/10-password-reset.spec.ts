import { expect, test, type Browser } from '@playwright/test';
import { alert, asRole, login, waitHydrated } from './helpers';
import { expectNoMail, linkIn, mailsTo, waitForMail } from './mail';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
// ไอพีสมมติที่ไม่ซ้ำต่อรอบรัน — ตัวนับจำกัดการขอลิงก์ (ต่อไอพี) เก็บในหน่วยความจำของเซิร์ฟเวอร์ ไม่ถูกล้างระหว่างรอบ
const ip = `203.0.113.${(Date.now() % 250) + 1}`;
const fresh = async (browser: Browser) => {
  const context = await browser.newContext({ baseURL, locale: 'th-TH', timezoneId: 'Asia/Bangkok', extraHTTPHeaders: { 'x-forwarded-for': ip } });
  return { context, page: await context.newPage() };
};

const RESET_SUBJECT = /ตั้งรหัสผ่านใหม่ — ServiceHub/;
const CHANGED_SUBJECT = /รหัสผ่านของคุณถูกเปลี่ยนแล้ว/;

async function requestLink(page: import('@playwright/test').Page, email: string) {
  await page.goto('/forgot-password');
  await waitHydrated(page);
  await page.getByLabel('อีเมล', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'ส่งลิงก์ตั้งรหัสผ่านใหม่' }).click();
  await expect(page.getByText('ตรวจสอบกล่องอีเมลของคุณ')).toBeVisible();
}

test.describe.serial('ลืมรหัสผ่านทางอีเมล', () => {
  const email = `reset-${Date.now()}@servicehub.local`;
  let temp = '';
  const strong = 'Maple-Harbor-3159!';

  test('เตรียมผู้ใช้ทดสอบ (ผู้ดูแลสร้างบัญชี)', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'admin');
    await page.goto('/admin/users/new');
    await waitHydrated(page);
    await page.getByLabel('อีเมล', { exact: true }).fill(email);
    await page.getByLabel('ชื่อ-นามสกุล').fill('ทดสอบ รีเซ็ต');
    await page.getByLabel('บทบาท').selectOption('AGENT');
    await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
    temp = (await page.getByTestId('temp-password').textContent())!.trim();
    await context.close();
  });

  test('หน้าเข้าสู่ระบบมีลิงก์ "ลืมรหัสผ่าน?" และเข้าถึงได้โดยไม่ล็อกอิน', async ({ browser }) => {
    const { page, context } = await fresh(browser);
    await page.goto('/login');
    await page.getByRole('link', { name: 'ลืมรหัสผ่าน?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { level: 1, name: 'ลืมรหัสผ่าน' })).toBeVisible();
    await context.close();
  });

  test('อีเมลที่ไม่มีในระบบ: ตอบเหมือนกันทุกประการ และไม่ส่งอีเมล (ไม่เปิดเผยว่ามีบัญชีหรือไม่)', async ({ browser }) => {
    const ghost = `ghost-${Date.now()}@servicehub.local`;
    const { page, context } = await fresh(browser);
    await requestLink(page, ghost);
    await expect(page.getByText('หากอีเมลนี้มีบัญชีอยู่ในระบบ')).toBeVisible();
    await expectNoMail(ghost, RESET_SUBJECT, 6_000);
    await context.close();
  });

  test('ลิงก์ที่เดา/ปลอมใช้ไม่ได้', async ({ browser }) => {
    const { page, context } = await fresh(browser);
    for (const t of ['garbage', 'A'.repeat(43), '']) {
      await page.goto(`/reset-password?token=${t}`);
      await expect(page.getByText('ลิงก์ไม่ถูกต้อง').first()).toBeVisible();
      await expect(page.getByLabel('รหัสผ่านใหม่', { exact: true })).toHaveCount(0);
    }
    await context.close();
  });

  let link = '';
  test('ขอลิงก์ → ได้อีเมลที่มีลิงก์ของระบบ (ไม่ใช้ Host header)', async ({ browser }) => {
    const { page, context } = await fresh(browser);
    await requestLink(page, email);
    const mail = await waitForMail(email, RESET_SUBJECT);
    link = linkIn(mail, '/reset-password?token=');
    expect(link.startsWith(baseURL)).toBe(true);
    expect(mail.html).toContain('ภายใน 30 นาที');
    expect(mail.text).not.toContain(temp);
    await context.close();
  });

  test('ตั้งรหัสผ่านใหม่: รหัสอ่อน/ไม่ตรงกันถูกปฏิเสธ แล้วสำเร็จด้วยรหัสที่ผ่านนโยบาย', async ({ browser }) => {
    const { page, context } = await fresh(browser);
    await page.goto(link);
    await waitHydrated(page);
    await expect(page.getByText(`สำหรับบัญชี ${email}`)).toBeVisible();

    await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill('short');
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill('short');
    await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
    await expect(alert(page)).toContainText('อย่างน้อย 10 ตัวอักษร');

    await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(strong);
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill(`${strong}x`);
    await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
    await expect(alert(page)).toContainText('ไม่ตรงกัน');

    await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(strong);
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill(strong);
    await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
    await expect(page).toHaveURL(/\/login\?reason=reset/);
    await expect(page.getByText('ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว')).toBeVisible();
    await context.close();
  });

  test('เข้าสู่ระบบด้วยรหัสใหม่ได้ (ไม่ถูกบังคับเปลี่ยนซ้ำ) และรหัสชั่วคราวเดิมใช้ไม่ได้', async ({ browser }) => {
    const bad = await fresh(browser);
    await login(bad.page, email, temp);
    await expect(alert(bad.page)).toContainText('ไม่ถูกต้อง');
    await bad.context.close();

    const ok = await fresh(browser);
    await login(ok.page, email, strong);
    await expect(ok.page).toHaveURL(/\/$/);
    await expect(ok.page).not.toHaveURL(/account/);
    await ok.context.close();
  });

  test('ลิงก์ใช้ได้ครั้งเดียว — เปิดซ้ำเห็นว่าถูกใช้ไปแล้ว', async ({ browser }) => {
    const { page, context } = await fresh(browser);
    await page.goto(link);
    await expect(page.getByText('ลิงก์นี้ถูกใช้ไปแล้ว').first()).toBeVisible();
    await expect(page.getByLabel('รหัสผ่านใหม่', { exact: true })).toHaveCount(0);
    await context.close();
  });

  test('ส่งอีเมลแจ้งว่ารหัสผ่านถูกเปลี่ยน (ไม่มีรหัสผ่านในเนื้อหา)', async () => {
    const mail = await waitForMail(email, CHANGED_SUBJECT);
    expect(mail.text).not.toContain(strong);
    expect(mail.html).not.toContain(strong);
    expect(mail.text).toContain('/forgot-password');
  });

  test('ขอลิงก์ซ้ำ: ได้ลิงก์ใหม่ที่ใช้งานได้', async ({ browser }) => {
    const { page, context } = await fresh(browser);
    await requestLink(page, email);
    await expect.poll(async () => (await mailsTo(email)).filter((m) => RESET_SUBJECT.test(m.subject)).length, { timeout: 30_000 }).toBe(2);
    const [newest, older] = (await mailsTo(email)).filter((m) => RESET_SUBJECT.test(m.subject));
    const firstLink = linkIn(older, '/reset-password?token=');
    const secondLink = linkIn(newest, '/reset-password?token=');
    expect(firstLink).toBe(link); // อันเก่าคือที่ใช้ไปแล้ว
    await page.goto(secondLink);
    await expect(page.getByLabel('รหัสผ่านใหม่', { exact: true })).toBeVisible();
    await context.close();
  });
});
