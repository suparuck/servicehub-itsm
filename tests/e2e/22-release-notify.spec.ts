import { expect, test, type Page } from '@playwright/test';
import { asRole, waitHydrated } from './helpers';
import { expectNoMail, linkIn, mailsTo, waitForMail } from './mail';

const OWNER = 'wanna@servicehub.local'; // วรรณา ใจดี (หัวหน้าทีม) — เจ้าของ Release ในเทสต์
const REQUESTER = 'somsak@servicehub.local'; // สมศักดิ์ — ผู้ขอ Change (สร้างโดยเจ้าหน้าที่)
const ACTOR = 'change@servicehub.local'; // ผู้จัดการ Change — ผู้กระทำ (ต้องไม่ได้รับแจ้งสิ่งที่ตนเองทำ)
const future = (days: number, hhmm: string) => new Date(Date.now() + 7 * 3600e3 + days * 86400e3).toISOString().slice(0, 10) + `T${hhmm}`;
const step = (page: Page) => page.locator('li[aria-current="step"]');
const countMails = async (to: string, subject: RegExp) => (await mailsTo(to)).filter((m) => subject.test(m.subject)).length;

async function move(page: Page, to: string, reason?: string) {
  await waitHydrated(page);
  await page.getByLabel('เปลี่ยนเป็น').selectOption({ label: to });
  if (reason !== undefined) await page.getByLabel(/^เหตุผล/).fill(reason);
  await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
}

async function createRelease(page: Page, o: { name: string; owner: string; plans?: boolean }) {
  await page.goto('/releases/new');
  await waitHydrated(page);
  await page.getByLabel(/^ชื่อ Release/).fill(o.name);
  await page.getByLabel(/^เจ้าของ Release/).selectOption({ label: o.owner });
  if (o.plans) {
    await page.getByLabel(/^เริ่มเปิดใช้/).fill(future(30, '22:00'));
    await page.getByLabel(/^สิ้นสุด/).fill(future(30, '23:30'));
    await page.getByLabel(/^แผนการเปิดใช้/).fill('ติดตั้งตามลำดับ');
    await page.getByLabel(/^แผนถอยกลับ/).fill('คืนค่าเดิม');
  }
  await page.getByRole('button', { name: 'สร้าง Release' }).click();
  await expect(page).toHaveURL(/\/releases\/REL-\d{4}$/);
  return page.url().split('/').pop()!;
}

test.describe.serial('แจ้งเตือน Release เปลี่ยนสถานะ', () => {
  let change = ''; // Standard Change ที่สร้างโดยเจ้าหน้าที่ (ผู้ขอ = สมศักดิ์)
  let rel = '';

  test('เตรียม: เจ้าหน้าที่สร้าง Standard Change แล้วส่งอนุมัติ (อนุมัติล่วงหน้าทันที)', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'agent');
    await page.goto('/changes/new');
    await waitHydrated(page);
    await page.getByLabel(/หัวข้อ Change/).fill('E2E-REL: ปรับค่าตั้งค่ามาตรฐาน');
    await page.getByLabel('ประเภท').selectOption('STANDARD');
    await page.getByLabel('เริ่ม (เวลาไทย)').fill(future(30, '22:00'));
    await page.getByLabel('สิ้นสุด (เวลาไทย)').fill(future(30, '23:00'));
    await page.getByRole('button', { name: 'บันทึกเป็นร่าง' }).click();
    await expect(page).toHaveURL(/\/changes\/CHG-\d+$/);
    change = page.url().split('/').pop()!;
    await waitHydrated(page);
    await page.getByRole('button', { name: 'ส่งอนุมัติ' }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('3. อนุมัติ');
    await context.close();
  });

  test('มอบ Release ให้เจ้าของ → เจ้าของได้อีเมลและกระดิ่ง (ผู้กระทำที่เป็นเจ้าของเองไม่ได้รับแจ้ง)', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'changeManager');
    rel = await createRelease(page, { name: 'E2E Release แจ้งเตือน', owner: 'วรรณา ใจดี', plans: true });
    const mail = await waitForMail(OWNER, new RegExp(`คุณเป็นเจ้าของ ${rel}`));
    expect(linkIn(mail, `/releases/${rel}`)).toContain(rel);

    const self = await createRelease(page, { name: 'E2E Release เจ้าของคือผู้สร้าง', owner: 'กมลา วงศ์ไทย' });
    await expectNoMail(ACTOR, new RegExp(self), 4_000); // เจ้าของคือผู้กระทำเอง
    await context.close();

    const lead = await asRole(browser, 'lead');
    await lead.page.goto('/notifications');
    await expect(lead.page.getByText(new RegExp(`คุณเป็นเจ้าของ ${rel}`)).first()).toBeVisible();
    await lead.context.close();
  });

  test('วงจรสถานะ: พร้อมเปิดใช้ → No-Go (พร้อมเหตุผล) → พร้อมอีกครั้ง → เริ่มเปิดใช้ → ถอยกลับ: เจ้าของและผู้ขอ Change ได้อีเมลทุกขั้น', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'changeManager');
    await page.goto(`/releases/${rel}`);
    await waitHydrated(page);
    const select = page.getByLabel(/^เพิ่ม Change/);
    await select.selectOption((await select.locator('option', { hasText: change }).getAttribute('value'))!);
    await page.getByRole('button', { name: 'เพิ่มเข้าแพ็กเกจ' }).click();
    await expect(page.getByTestId('package').getByRole('link', { name: change })).toBeVisible();

    await move(page, 'กำลังจัดเตรียม');
    await expect(step(page)).toContainText('กำลังจัดเตรียม');
    await expectNoMail(OWNER, new RegExp(`(พร้อมเปิดใช้|กำลังจัดเตรียม).*${rel}`), 3_000); // เริ่มจัดเตรียมตามปกติไม่แจ้ง

    await move(page, 'พร้อมเปิดใช้');
    await expect(step(page)).toContainText('พร้อมเปิดใช้');
    for (const to of [OWNER, REQUESTER]) {
      const m = await waitForMail(to, new RegExp(`พร้อมเปิดใช้: ${rel}`));
      expect(m.text).toContain('จำนวน Change');
      expect(linkIn(m, `/releases/${rel}`)).toContain(rel);
    }
    expect(await countMails(ACTOR, new RegExp(rel))).toBe(0); // ผู้กระทำไม่ได้รับแจ้งสิ่งที่ตนทำ

    await move(page, 'กำลังจัดเตรียม', 'ขอเพิ่มการทดสอบ <b>ก่อนเปิดใช้</b>');
    for (const to of [OWNER, REQUESTER]) {
      const m = await waitForMail(to, new RegExp(`No-Go.*${rel}`));
      expect(m.text).toContain('ขอเพิ่มการทดสอบ <b>ก่อนเปิดใช้</b>'); // ข้อความเหตุผลอยู่ในอีเมล
      expect(m.html).not.toContain('<b>ก่อนเปิดใช้</b>'); // HTML ถูก escape
      expect(m.html).toContain('&lt;b&gt;');
    }

    await move(page, 'พร้อมเปิดใช้');
    await expect(step(page)).toContainText('พร้อมเปิดใช้');
    await expect.poll(() => countMails(OWNER, new RegExp(`พร้อมเปิดใช้: ${rel}`)), { timeout: 20_000 }).toBe(2); // ตัดสิน Go ครั้งที่สอง = แจ้งครั้งที่สอง (ไม่ซ้ำเงียบ)

    await move(page, 'กำลังเปิดใช้');
    await waitForMail(OWNER, new RegExp(`เริ่มเปิดใช้งาน: ${rel}`));
    await waitForMail(REQUESTER, new RegExp(`เริ่มเปิดใช้งาน: ${rel}`));

    await move(page, 'ถอยกลับแล้ว', 'ระบบช้าลงหลังเปิดใช้');
    for (const to of [OWNER, REQUESTER]) {
      const m = await waitForMail(to, new RegExp(`ถอยกลับแล้ว: ${rel}`));
      expect(m.text).toContain('ระบบช้าลงหลังเปิดใช้');
    }
    await context.close();
  });

  test('ยกเลิก Release: ผู้ขอ Change ยังได้รับแจ้ง (คำนวณผู้รับก่อนปล่อย Change ออกจากแพ็กเกจ)', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'changeManager');
    // Change เดิมอยู่ใน Release ที่ถอยกลับแล้ว จึงสร้าง Change ใหม่ผ่านเจ้าหน้าที่อีกชุด
    const agent = await asRole(browser, 'agent');
    await agent.page.goto('/changes/new');
    await waitHydrated(agent.page);
    await agent.page.getByLabel(/หัวข้อ Change/).fill('E2E-REL: Change สำหรับ Release ที่จะยกเลิก');
    await agent.page.getByLabel('ประเภท').selectOption('STANDARD');
    await agent.page.getByLabel('เริ่ม (เวลาไทย)').fill(future(40, '22:00'));
    await agent.page.getByLabel('สิ้นสุด (เวลาไทย)').fill(future(40, '23:00'));
    await agent.page.getByRole('button', { name: 'บันทึกเป็นร่าง' }).click();
    await expect(agent.page).toHaveURL(/\/changes\/CHG-\d+$/);
    const chg2 = agent.page.url().split('/').pop()!;
    await waitHydrated(agent.page);
    await agent.page.getByRole('button', { name: 'ส่งอนุมัติ' }).click();
    await expect(agent.page.locator('li[aria-current="step"]')).toContainText('3. อนุมัติ');
    await agent.context.close();

    const cancelRel = await createRelease(page, { name: 'E2E Release ที่จะยกเลิก', owner: 'วรรณา ใจดี' });
    await waitHydrated(page);
    const select = page.getByLabel(/^เพิ่ม Change/);
    await select.selectOption((await select.locator('option', { hasText: chg2 }).getAttribute('value'))!);
    await page.getByRole('button', { name: 'เพิ่มเข้าแพ็กเกจ' }).click();
    await expect(page.getByTestId('package').getByRole('link', { name: chg2 })).toBeVisible();
    await move(page, 'ยกเลิก', 'ลำดับความสำคัญเปลี่ยน');
    await expect(page.getByTestId('package').getByRole('listitem')).toHaveCount(0);
    for (const to of [OWNER, REQUESTER]) {
      const m = await waitForMail(to, new RegExp(`ยกเลิก: ${cancelRel}`));
      expect(m.text).toContain('ลำดับความสำคัญเปลี่ยน');
    }
    await context.close();
  });

  test('ผู้ใช้ปิดหมวด "ความคืบหน้าของเรื่องที่ฉันแจ้ง/ขอ" → ไม่ได้อีเมลสถานะ Release (แต่ยังได้อีเมลมอบเป็นเจ้าของ)', async ({ browser }) => {
    const lead = await asRole(browser, 'lead');
    await lead.page.goto('/account');
    await lead.page.getByLabel(/ความคืบหน้าของเรื่องที่ฉันแจ้งหรือขอ/).uncheck();
    await lead.page.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }).click();
    await expect(lead.page.getByText('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')).toBeVisible();

    const { page, context } = await asRole(browser, 'changeManager');
    const r = await createRelease(page, { name: 'E2E Release ปิดหมวด', owner: 'วรรณา ใจดี' });
    await waitForMail(OWNER, new RegExp(`คุณเป็นเจ้าของ ${r}`)); // หมวด "งานที่มอบหมาย" ยังเปิดอยู่
    await move(page, 'ยกเลิก', 'ทดสอบปิดหมวด');
    await expect(page.getByTestId('go-list')).toHaveCount(0);
    await expectNoMail(OWNER, new RegExp(`ยกเลิก: ${r}`), 5_000);
    await context.close();

    await lead.page.goto('/account');
    await lead.page.getByLabel(/ความคืบหน้าของเรื่องที่ฉันแจ้งหรือขอ/).check();
    await lead.page.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }).click();
    await expect(lead.page.getByText('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')).toBeVisible();
    await lead.context.close();
  });
});
