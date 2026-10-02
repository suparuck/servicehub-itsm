import { expect, test } from '@playwright/test';
import { alert, asRole, authFile, waitHydrated } from './helpers';

test.describe('พอร์ทัลผู้ใช้', () => {
  test.use({ storageState: authFile('endUser') });

  test('หน้าแรก: ทักทาย แบนเนอร์เหตุขัดข้อง ทางลัด 4 อย่าง และรายการของฉัน', async ({ page }) => {
    await page.goto('/portal');
    await expect(page.getByText('สวัสดีคุณมณีรัตน์')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'ERP' })).toContainText('ขัดข้อง');
    for (const t of ['แจ้งปัญหาการใช้งาน', 'ขอรับบริการ', 'ขอสิทธิ์เข้าถึง', 'ค้นหาวิธีแก้ด้วยตนเอง']) await expect(page.getByRole('link', { name: new RegExp(t) })).toBeVisible();
    await expect(page.getByText('INC-24811').first()).toBeVisible();
    await expect(page.getByText('รอข้อมูลจากคุณ').first()).toBeVisible();
    await expect(page.getByText('ติดตั้งโปรแกรม Adobe Acrobat')).toBeVisible(); // รอประเมิน
  });

  test('ค้นหาพบบริการและบทความ แล้วเปิดอ่านบทความได้', async ({ page }) => {
    await page.goto('/portal');
    await page.getByRole('searchbox', { name: 'ค้นหาบริการหรือบทความ' }).fill('vpn');
    await page.getByRole('button', { name: 'ค้นหา' }).click();
    await expect(page).toHaveURL(/\/portal\/search\?q=vpn/);
    await page.getByRole('link', { name: /VPN หลุดบ่อย/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: /VPN หลุดบ่อย/ })).toBeVisible();
    await expect(page.getByText('วิธีแก้ชั่วคราว:').first()).toBeVisible();
  });

  test('ค้นหาไม่พบ → เสนอให้แจ้งปัญหา', async ({ page }) => {
    await page.goto('/portal/search?q=zzzไม่มีแน่นอน');
    await expect(page.getByRole('link', { name: 'แจ้งปัญหากับทีม IT' })).toBeVisible();
  });

  test('เปิดดูรายการของคนอื่นไม่ได้ (404)', async ({ page }) => {
    const res = await page.goto('/portal/my/INC-24817');
    expect(res?.status()).toBe(404);
  });
});

test.describe.serial('วงจรแจ้งปัญหา → แก้ไข → ยืนยัน → ประเมิน', () => {
  let docNo = '';
  test.use({ storageState: authFile('endUser') });

  test('ผู้ใช้แจ้งปัญหา (หลายแผนก + ทำงานไม่ได้เลย) → ได้ P1 ในคิว Service Desk', async ({ page, browser }) => {
    await page.goto('/portal/incident/new');
    await waitHydrated(page);
    await page.getByLabel(/ปัญหาที่พบ/).fill('E2E: เข้า ERP ไม่ได้ทั้งสาขา');
    await page.getByLabel('บริการที่เกี่ยวข้อง').selectOption({ label: 'ERP' });
    await page.getByLabel('หลายแผนกหรือหลายสาขา').check();
    await page.getByLabel('ทำงานไม่ได้เลย').check();
    await page.getByRole('button', { name: 'ส่งเรื่อง' }).click();
    await expect(page).toHaveURL(/\/portal\/my\/INC-\d+$/);
    docNo = page.url().split('/').pop()!;
    await expect(page.getByText('รับเรื่องแล้ว').first()).toBeVisible();

    const staff = await asRole(browser, 'agent');
    await staff.page.goto(`/incidents/${docNo}`);
    await expect(staff.page.getByText('P1 วิกฤต').first()).toBeVisible();
    await expect(staff.page.getByText('Service Desk L1').first()).toBeVisible();
    await expect(staff.page.getByText('พอร์ทัลผู้ใช้').first()).toBeVisible();
    await staff.context.close();
  });

  test('ตอบกลับตอนรอข้อมูลจากผู้ใช้ → งานเดินต่อ', async ({ page, browser }) => {
    const staff = await asRole(browser, 'agent');
    await staff.page.goto(`/incidents/${docNo}`);
    await waitHydrated(staff.page);
    // NEW → รอผู้ใช้ ไม่อยู่ในกติกาวงจรชีวิต ต้องรับงาน (กำลังดำเนินการ) ก่อน
    await staff.page.getByLabel('สถานะถัดไป').selectOption('IN_PROGRESS');
    await staff.page.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(staff.page.locator('li[aria-current="step"]')).toContainText('3. วินิจฉัย');
    await waitHydrated(staff.page);
    await staff.page.getByLabel('สถานะถัดไป').selectOption('PENDING_USER');
    await staff.page.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(staff.page.getByText('หยุดชั่วคราว')).toBeVisible();

    await page.goto(`/portal/my/${docNo}`);
    await expect(page.getByText('รอข้อมูลจากคุณ').first()).toBeVisible();
    await waitHydrated(page);
    await page.getByLabel('ตอบกลับทีม IT').fill('แนบแล้ว เป็น ORA-12170');
    await page.getByRole('button', { name: 'ส่งข้อความ' }).click();
    await expect(page.getByText('กำลังแก้ไข').first()).toBeVisible();
    await expect(page.getByText('แนบแล้ว เป็น ORA-12170')).toBeVisible();

    await staff.page.reload();
    await expect(staff.page.locator('li[aria-current="step"]')).toContainText('3. วินิจฉัย');
    await expect(staff.page.getByText('หยุดชั่วคราว')).toHaveCount(0);
    await staff.context.close();
  });

  test('เจ้าหน้าที่แก้ไข → ผู้ใช้ "ยังไม่หาย" เรื่องกลับมาเปิด → แก้ซ้ำ → ยืนยันปิด → ให้คะแนน', async ({ page, browser }) => {
    const staff = await asRole(browser, 'agent');
    const resolve = async (note: string) => {
      await staff.page.goto(`/incidents/${docNo}`);
      await waitHydrated(staff.page);
      await staff.page.getByLabel('สถานะถัดไป').selectOption('RESOLVED');
      await staff.page.getByLabel(/บันทึก \(จำเป็น/).fill(note);
      await staff.page.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
      await expect(staff.page.locator('li[aria-current="step"]')).toContainText('4. แก้ไขและกู้คืน');
    };
    await resolve('รีสตาร์ท connection pool');

    await page.goto(`/portal/my/${docNo}`);
    await expect(page.getByText('แก้ไขแล้ว — โปรดยืนยัน').first()).toBeVisible();
    await waitHydrated(page, 'form');
    await page.getByLabel('เหตุผล (ไม่บังคับ)').fill('ยังเข้าไม่ได้บางสาขา');
    await page.getByRole('button', { name: 'ยังไม่หาย' }).click();
    await expect(page.getByText('กำลังแก้ไข').first()).toBeVisible();

    await resolve('ปรับเส้นทางเครือข่ายสาขาภาคเหนือ');
    await page.goto(`/portal/my/${docNo}`);
    await waitHydrated(page);
    await page.getByRole('button', { name: 'หายแล้ว ปิดเรื่องได้' }).click();
    await expect(page.getByText('ปิดแล้ว').first()).toBeVisible();
    await expect(page.getByLabel('ตอบกลับทีม IT')).toHaveCount(0);

    await page.getByLabel(/ความคิดเห็นเพิ่มเติม/).fill('รวดเร็วมาก');
    await page.getByRole('button', { name: '5 คะแนน' }).click();
    await expect(page.getByText('ขอบคุณสำหรับการประเมิน · 5/5')).toBeVisible();
    await staff.context.close();
  });
});

test.describe.serial('วงจรคำขอบริการ', () => {
  let docNo = '';
  test.use({ storageState: authFile('endUser') });

  test('ผู้ใช้ส่งคำขอ → รออนุมัติ', async ({ page }) => {
    await page.goto('/portal/request/new?access=1');
    await waitHydrated(page);
    await expect(page.getByLabel(/ประเภทบริการ/)).toHaveValue(/.+/);
    await page.getByLabel(/สิ่งที่ต้องการ/).fill('ขอสิทธิ์เข้าถึง: โฟลเดอร์ฝ่ายขาย (E2E)');
    await page.getByLabel('รายละเอียดและเหตุผล').fill('ใช้ทำรายงานประจำเดือน');
    await page.getByRole('button', { name: 'ส่งคำขอ' }).click();
    await expect(page).toHaveURL(/\/portal\/my\/REQ-\d+$/);
    docNo = page.url().split('/').pop()!;
    await expect(page.getByText('รออนุมัติ').first()).toBeVisible();
  });

  test('หัวหน้าอนุมัติ → ทีม IT เพิ่มงาน/ทำเสร็จ/ส่งมอบ (ส่งมอบก่อนงานเสร็จไม่ได้) → ผู้ใช้เห็นส่งมอบแล้ว', async ({ page, browser }) => {
    const lead = await asRole(browser, 'lead');
    await lead.page.goto(`/requests/${docNo}`);
    await waitHydrated(lead.page);
    await lead.page.getByRole('button', { name: 'ไม่อนุมัติ' }).click();
    await expect(alert(lead.page)).toContainText('ต้องระบุเหตุผล');
    await waitHydrated(lead.page);
    await lead.page.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
    await expect(lead.page.locator('li[aria-current="step"]')).toContainText('3. จัดเตรียม');

    await waitHydrated(lead.page);
    await lead.page.getByPlaceholder('เช่น ติดตั้งโปรแกรมมาตรฐาน').fill('ตั้งค่าสิทธิ์โฟลเดอร์');
    await lead.page.getByRole('button', { name: 'เพิ่มงาน', exact: true }).last().click();
    await expect(lead.page.getByText('○ ตั้งค่าสิทธิ์โฟลเดอร์')).toBeVisible();
    await expect(lead.page.getByRole('button', { name: 'ส่งมอบคำขอ' })).toBeDisabled();

    await lead.page.getByRole('button', { name: /เสร็จแล้ว: ตั้งค่าสิทธิ์โฟลเดอร์/ }).click();
    await expect(lead.page.getByText('✓ ตั้งค่าสิทธิ์โฟลเดอร์')).toBeVisible();
    await lead.page.getByRole('button', { name: 'ส่งมอบคำขอ' }).click();
    await expect(lead.page.locator('li[aria-current="step"]')).toContainText('4. ส่งมอบ');

    await page.goto(`/portal/my/${docNo}`);
    await expect(page.getByText('ส่งมอบแล้ว').first()).toBeVisible();
    await expect(page.getByRole('group', { name: 'ให้คะแนน 1 ถึง 5' })).toBeVisible();
    await lead.context.close();
  });
});
