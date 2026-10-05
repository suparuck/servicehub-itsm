import { expect, test, type Page } from '@playwright/test';
import { asRole, authFile, USERS, waitHydrated } from './helpers';
import { expectNoMail, linkIn, mailsTo, waitForMail } from './mail';

// ผู้รับ: เจ้าของ CI + ผู้จัดการ CMDB (somchai) + ผู้ดูแล (admin) — CI ตัวอย่างของสินทรัพย์เหล่านี้ไม่มีเจ้าของรายบุคคล
const MANAGER = 'somchai@servicehub.local';
const ymdAt = (days: number) => new Date(Date.now() + 7 * 3600e3 + days * 86400e3).toISOString().slice(0, 10);

async function saveAsset(page: Page, tag: string, field: RegExp | string, value: string) {
  await page.goto(`/assets/${tag}`);
  await waitHydrated(page);
  await page.getByLabel(field).fill(value);
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()]);
  await page.waitForLoadState('networkidle');
}
const countMails = async (to: string, subject: RegExp) => (await mailsTo(to)).filter((m) => subject.test(m.subject)).length;

test.describe.serial('แจ้งเตือนประกัน/ไลเซนส์ใกล้หมด', () => {
  test.use({ storageState: authFile('agent') });

  test('ไลเซนส์ใกล้หมด (อีก 35 วัน) และใช้เกินสิทธิ์: ผู้จัดการ CMDB และผู้ดูแลได้อีเมล พร้อมลิงก์ไปสินทรัพย์', async ({ page }) => {
    await saveAsset(page, 'ASSET-LIC-0101', 'ผู้ขาย/ผู้ผลิต', 'Adobe Inc.');
    for (const to of [USERS.admin, MANAGER]) {
      const near = await waitForMail(to, /ไลเซนส์ใกล้หมด \(อีก 35 วัน\).*ASSET-LIC-0101/);
      expect(near.text).toContain('35 วัน');
      expect(linkIn(near, '/assets/ASSET-LIC-0101')).toContain('/assets/ASSET-LIC-0101');
      const over = await waitForMail(to, /ไลเซนส์ใช้เกินสิทธิ์.*\(52\/50\)/);
      expect(over.text).toContain('52');
      expect(over.html).toContain('ไลเซนส์ใช้เกินสิทธิ์ที่ซื้อ');
    }
  });

  test('ส่งครั้งเดียวต่อขั้น: แก้ไขสินทรัพย์เดิมอีกครั้งไม่ส่งซ้ำ', async ({ page }) => {
    await saveAsset(page, 'ASSET-LIC-0101', 'ผู้ขาย/ผู้ผลิต', 'Adobe Systems');
    await new Promise((r) => setTimeout(r, 6000)); // รอ worker ส่งให้ครบก่อนนับ (กันผลลบเท็จ)
    expect(await countMails(USERS.admin, /ไลเซนส์ใกล้หมด.*ASSET-LIC-0101/)).toBe(1);
    expect(await countMails(USERS.admin, /ไลเซนส์ใช้เกินสิทธิ์.*\(52\/50\)/)).toBe(1);
  });

  test('ผู้ดูแลเห็นการแจ้งเตือนในระบบ (กระดิ่ง) ควบคู่กับอีเมล และลิงก์ไปสินทรัพย์ได้', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/notifications');
    await expect(admin.page.getByText(/ไลเซนส์ใช้เกินสิทธิ์: Adobe/).first()).toBeVisible();
    await admin.page.getByRole('link', { name: /ไลเซนส์ใกล้หมด \(อีก 35 วัน\)/ }).first().click();
    await expect(admin.page).toHaveURL(/\/assets\/ASSET-LIC-0101$/);
    await admin.context.close();
  });

  test('ประกันหมดอายุแล้ว (ไฟร์วอลล์ MA หมดเมื่อ 10 วันก่อน) → แจ้งว่าหมดอายุแล้ว', async ({ page }) => {
    await saveAsset(page, 'ASSET-NET-0120', 'สถานที่', 'ห้อง Network ชั้น 2');
    const mail = await waitForMail(USERS.admin, /ประกัน\/สัญญา MAหมดอายุแล้ว.*ASSET-NET-0120/);
    expect(mail.text).toContain('เกินมา 10 วัน');
    await waitForMail(MANAGER, /ประกัน\/สัญญา MAหมดอายุแล้ว.*ASSET-NET-0120/);
  });

  test('ผู้ใช้ปิดหมวด "ประกัน/ไลเซนส์ใกล้หมด" → ไม่ได้อีเมลและไม่มีรายการในกระดิ่ง (คนอื่นยังได้)', async ({ browser, page }) => {
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/account');
    await admin.page.getByLabel(/ประกัน\/ไลเซนส์ใกล้หมด/).uncheck();
    await admin.page.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }).click();
    await expect(admin.page.getByText('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')).toBeVisible();

    await saveAsset(page, 'ASSET-NET-0121', 'สถานที่', 'DC1 · Rack A2'); // MA อีก 60 วัน → ขั้น 90
    await waitForMail(MANAGER, /ประกัน\/สัญญา MAใกล้หมด \(อีก 60 วัน\).*ASSET-NET-0121/);
    await expectNoMail(USERS.admin, /ASSET-NET-0121/, 5_000);
    await admin.page.goto('/notifications');
    await expect(admin.page.getByText(/ASSET-NET-0121/)).toHaveCount(0);

    await admin.page.goto('/account');
    await admin.page.getByLabel(/ประกัน\/ไลเซนส์ใกล้หมด/).check();
    await admin.page.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }).click();
    await expect(admin.page.getByText('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')).toBeVisible();
    await admin.context.close();
  });

  test('รับสินทรัพย์ใหม่ที่ใกล้หมดแล้ว (อีก 5 วัน) → แจ้งทันทีเฉพาะขั้นปัจจุบัน ไม่ย้อนแจ้งขั้น 90/30', async ({ page }) => {
    await page.goto('/assets/new');
    await waitHydrated(page);
    const select = page.getByLabel(/CI ที่จะขึ้นทะเบียน/);
    await select.selectOption((await select.locator('option', { hasText: 'NB-HR-0044' }).getAttribute('value'))!);
    await page.getByLabel(/สิ้นสุดประกัน\/MA/).fill(ymdAt(5));
    await page.getByRole('button', { name: 'รับเข้าทะเบียน' }).click();
    await expect(page).toHaveURL(/\/assets\/ASSET-EUD-\d{4}$/);
    const tag = page.url().split('/').pop()!;
    const mail = await waitForMail(USERS.admin, new RegExp(`อีก 5 วัน.*${tag}`));
    expect(mail.subject).toContain('ประกัน/สัญญา MAใกล้หมด');
    await new Promise((r) => setTimeout(r, 4000));
    expect((await mailsTo(USERS.admin)).filter((m) => m.subject.includes(tag))).toHaveLength(1);
  });

  test('สินทรัพย์ที่ปลดระวางแล้วไม่ถูกแจ้งเตือน', async ({ page }) => {
    await page.goto('/assets/ASSET-EUD-1937'); // ส่งซ่อม มีประกันอีก 300 วัน — เปลี่ยนเป็นปลดระวางแล้วแก้ไม่ได้ จึงตรวจจากอีเมลที่ไม่มี
    await waitHydrated(page);
    await page.getByLabel('สถานะถัดไป').selectOption('RETIRED');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'ปลดระวางแล้ว' })).toBeVisible();
    await expectNoMail(USERS.admin, /ASSET-EUD-1937/, 4_000);
  });
});
