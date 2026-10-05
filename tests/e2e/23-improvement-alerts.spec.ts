import { expect, test, type Page } from '@playwright/test';
import { asRole, authFile, USERS, waitHydrated } from './helpers';
import { expectNoMail, linkIn, mailsTo, waitForMail } from './mail';

const THANAPHON = 'thanaphon@servicehub.local'; // เจ้าของ IMP-0002 (เลยกำหนด 5 วันตามข้อมูลตัวอย่าง)
const SOMCHAI = 'somchai@servicehub.local'; // เจ้าของ IMP-0003
const WANNA = USERS.lead; // เจ้าของ IMP-0001 และหัวหน้าทีม (ผู้รับกรณีรายการไม่มีเจ้าของ)
const ymdAt = (days: number) => new Date(Date.now() + 7 * 3600e3 + days * 86400e3).toISOString().slice(0, 10);
const countMails = async (to: string, subject: RegExp) => (await mailsTo(to)).filter((m) => subject.test(m.subject)).length;

async function saveEdit(page: Page, no: string, field: RegExp | string, value: string) {
  await page.goto(`/improvement/${no}`);
  await waitHydrated(page);
  await page.getByLabel(field).fill(value);
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()]);
  await page.waitForLoadState('networkidle');
}

async function createOverdue(page: Page, title: string, daysAgo: number) {
  await page.goto('/improvement/new');
  await waitHydrated(page);
  await page.getByLabel(/หัวข้อการปรับปรุง/).fill(title);
  await page.getByLabel('วันเป้าหมาย').fill(ymdAt(-daysAgo));
  await page.getByRole('button', { name: 'เสนอรายการ' }).click();
  await expect(page).toHaveURL(/\/improvement\/IMP-\d{4}$/);
  return page.url().split('/').pop()!;
}

test.describe.serial('แจ้งเตือนรายการปรับปรุงที่เลยกำหนด', () => {
  test.use({ storageState: authFile('agent') });

  test('รายการที่เลยกำหนด 5 วัน → เจ้าของได้อีเมลที่มีขั้นตอนปัจจุบันและลิงก์ ส่งครั้งเดียวแม้แก้ไขซ้ำ', async ({ page }) => {
    await saveEdit(page, 'IMP-0002', /^สถานะปัจจุบัน/, 'คำขอรีเซ็ตรหัสผ่านราว 150 รายการ/เดือน');
    const mail = await waitForMail(THANAPHON, /เลยกำหนด 5 วัน.*IMP-0002/);
    expect(mail.text).toContain('ขั้นที่ 3/7');
    expect(linkIn(mail, '/improvement/IMP-0002')).toContain('IMP-0002');
    expect(mail.html).toContain('Chatbot'); // ชื่อรายการ
    await saveEdit(page, 'IMP-0002', /^สถานะปัจจุบัน/, 'คำขอรีเซ็ตรหัสผ่านราว 160 รายการ/เดือน');
    await new Promise((r) => setTimeout(r, 6000));
    expect(await countMails(THANAPHON, /เลยกำหนด.*IMP-0002/)).toBe(1);
  });

  test('รายการที่ยังไม่เลยกำหนดไม่ถูกแจ้ง', async ({ page }) => {
    await saveEdit(page, 'IMP-0001', /^สถานะปัจจุบัน/, 'MTTR ของ P2 เฉลี่ย 6.1 ชม.');
    await expectNoMail(WANNA, /เลยกำหนด.*IMP-0001/, 4_000);
  });

  test('รายการไม่มีเจ้าของ: แจ้งหัวหน้าทีมและผู้ดูแล (และขึ้นในกระดิ่ง); เลยมาแล้ว 1 วัน', async ({ page, browser }) => {
    const no = await createOverdue(page, 'E2E ปรับปรุงที่ไม่มีเจ้าของ', 1);
    for (const to of [WANNA, USERS.admin]) {
      const m = await waitForMail(to, new RegExp(`เลยกำหนด 1 วัน.*${no}`));
      expect(m.text).toContain('เลยมาแล้ว');
    }
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/notifications');
    await expect(admin.page.getByText(new RegExp(`เลยกำหนด 1 วัน: ${no}`)).first()).toBeVisible();
    await admin.context.close();
  });

  test('ผู้ใช้ปิดหมวด "งานที่มอบหมายให้ฉัน" → ไม่ได้อีเมลและไม่มีรายการในกระดิ่ง (ผู้ดูแลยังได้)', async ({ page, browser }) => {
    const lead = await asRole(browser, 'lead');
    await lead.page.goto('/account');
    await lead.page.getByLabel(/งานที่มอบหมายให้ฉัน/).uncheck();
    await lead.page.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }).click();
    await expect(lead.page.getByText('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')).toBeVisible();

    const no = await createOverdue(page, 'E2E ปรับปรุงปิดหมวด', 2);
    await waitForMail(USERS.admin, new RegExp(`เลยกำหนด 2 วัน.*${no}`));
    await expectNoMail(WANNA, new RegExp(no), 4_000);
    await lead.page.goto('/notifications');
    await expect(lead.page.getByText(new RegExp(no))).toHaveCount(0);

    await lead.page.goto('/account');
    await lead.page.getByLabel(/งานที่มอบหมายให้ฉัน/).check();
    await lead.page.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }).click();
    await expect(lead.page.getByText('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')).toBeVisible();
    await lead.context.close();
  });

  test('รายการที่พักไว้ไม่ถูกแจ้งแม้เลยกำหนด → กลับมาดำเนินการแล้วแจ้งทันทีที่ตรวจครั้งถัดไป', async ({ page }) => {
    await page.goto('/improvement/IMP-0003');
    await waitHydrated(page);
    await page.getByLabel('เปลี่ยนเป็น').selectOption('ON_HOLD');
    await page.getByLabel(/^เหตุผล/).fill('รอผลสำรวจ');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByText('พักไว้').first()).toBeVisible();

    await page.goto('/improvement/IMP-0003');
    await waitHydrated(page);
    await page.getByLabel('วันเป้าหมาย').fill(ymdAt(-3));
    await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()]);
    await page.waitForLoadState('networkidle');
    await expectNoMail(SOMCHAI, /เลยกำหนด.*IMP-0003/, 5_000); // พักอยู่ → ไม่แจ้ง

    await page.goto('/improvement/IMP-0003');
    await waitHydrated(page);
    await page.getByLabel('เปลี่ยนเป็น').selectOption('OPEN');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByRole('heading', { name: 'เปลี่ยนขั้นตอน' })).toBeVisible();
    await saveEdit(page, 'IMP-0003', /^สถานะปัจจุบัน/, 'CI ฮาร์ดแวร์ 12 รายการ มีสินทรัพย์ผูก 7 รายการ');
    await waitForMail(SOMCHAI, /เลยกำหนด 3 วัน.*IMP-0003/);
  });

  test('เลื่อนวันเป้าหมายแล้วเลยอีกครั้ง → แจ้งใหม่ (กุญแจกันซ้ำผูกกับวันเป้าหมาย)', async ({ page }) => {
    await saveEdit(page, 'IMP-0002', 'วันเป้าหมาย', ymdAt(-1)); // เดิมเลย 5 วัน (แจ้งไปแล้ว) → ตั้งเป็นเลย 1 วัน = วันเป้าหมายใหม่
    await waitForMail(THANAPHON, /เลยกำหนด 1 วัน.*IMP-0002/);
    expect(await countMails(THANAPHON, /เลยกำหนด.*IMP-0002/)).toBe(2);
  });
});
