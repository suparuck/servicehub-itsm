import { expect, test } from '@playwright/test';
import { alert, asRole, authFile, monthHeading, waitHydrated } from './helpers';

test.describe('Change Enablement', () => {
  test.use({ storageState: authFile('agent') });

  test('ปฏิทินเดือนปัจจุบันแสดง Change ของวันนี้ และเลื่อนเดือนได้', async ({ page }) => {
    // ไม่ผูกกับวันที่จริง: Change ตัวอย่าง CHG-3381 ถูก seed ให้เป็น "วันนี้" เสมอ
    await page.goto('/changes?view=calendar');
    await expect(page.getByRole('heading', { name: monthHeading() })).toBeVisible();
    const grid = page.getByRole('grid', { name: 'ปฏิทิน Change' });
    await expect(grid.getByRole('link', { name: /CHG-3381|แพตช์ฐานข้อมูล ERP/ }).first()).toBeVisible();
    await page.getByRole('link', { name: /เดือนถัดไป/ }).click();
    await expect(page.getByRole('heading', { name: monthHeading(1) })).toBeVisible();
    await page.getByRole('link', { name: /เดือนก่อน/ }).click();
    await expect(page.getByRole('heading', { name: monthHeading() })).toBeVisible();
  });

  test('เจ้าหน้าที่ทั่วไปเห็น Change แต่อนุมัติไม่ได้', async ({ page }) => {
    await page.goto('/changes/CHG-3381');
    await expect(page.getByText('Emergency Change').first()).toBeVisible();
    await expect(page.getByText('รอพิจารณา')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'อนุมัติ', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'จัดตารางดำเนินการ' })).toHaveCount(0);
  });

  test('ส่งอนุมัติไม่ได้ถ้าไม่มีแผนถอยกลับ แล้วสร้างที่ครบถ้วนส่ง ECAB ได้ พร้อมเตือน Change ที่ชนกัน', async ({ page }) => {
    const when = new Date(Date.now() + 7 * 3600e3 + 2 * 86400e3).toISOString().slice(0, 10);
    await page.goto('/changes/new');
    await waitHydrated(page);
    await page.getByLabel(/หัวข้อ Change/).fill('E2E: เปลี่ยน rule ไฟร์วอลล์');
    await page.getByLabel('เริ่ม (เวลาไทย)').fill(`${when}T01:30`);
    await page.getByLabel('สิ้นสุด (เวลาไทย)').fill(`${when}T02:30`);
    await page.getByLabel('แผนการดำเนินการ (Implementation plan)').fill('เพิ่ม rule พอร์ต 443');
    await page.getByLabel(/FW-North-01/).check();
    await page.getByRole('button', { name: 'บันทึกเป็นร่าง' }).click();
    await expect(page).toHaveURL(/\/changes\/CHG-\d+$/);
    await expect(page.getByRole('status').filter({ hasText: 'พบ Change ที่ทับช่วงเวลา' })).toContainText('CHG-3376');

    await page.getByRole('button', { name: 'ส่งอนุมัติ' }).click();
    await expect(alert(page)).toContainText('แผนถอยกลับ');

    await page.getByRole('link', { name: 'แก้ไข', exact: true }).click();
    await waitHydrated(page);
    await page.getByLabel('แผนถอยกลับ (Back-out plan)').fill('ลบ rule ที่เพิ่ม');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await page.getByRole('button', { name: 'ส่งอนุมัติ' }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('2. รออนุมัติ');
    await expect(page.getByText('รอพิจารณา')).toHaveCount(3);
  });
});

test.describe.serial('การอนุมัติ CAB/ECAB ข้ามบทบาท', () => {
  test('Emergency: สมาชิก ECAB คนเดียวอนุมัติก็ผ่าน', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'cab');
    await page.goto('/changes/CHG-3381');
    await waitHydrated(page);
    await page.getByLabel(/ความเห็น/).fill('เร่งด่วน ผ่านครับ');
    await page.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('3. อนุมัติ');
    await expect(page.getByText('ผ่านการอนุมัติ')).toBeVisible();
    await expect(page.getByText('ECAB อนุมัติ: เร่งด่วน ผ่านครับ')).toBeVisible();
    // สมาชิกที่เหลือไม่ต้องตัดสินใจแล้ว
    await expect(page.getByRole('button', { name: 'อนุมัติ', exact: true })).toHaveCount(0);
    await context.close();
  });

  test('Normal: ไม่อนุมัติต้องมีเหตุผล และกลับเป็นร่าง', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'cab2');
    await page.goto('/changes/CHG-3365');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'ไม่อนุมัติ' }).click();
    await expect(alert(page)).toContainText('ต้องระบุเหตุผล');
    await waitHydrated(page);
    await page.getByLabel(/ความเห็น/).fill('ช่วงเวลาชนกับปิดงวดบัญชี');
    await page.getByRole('button', { name: 'ไม่อนุมัติ' }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('1. ร่าง');
    await expect(page.getByText('ถูกปฏิเสธ — กลับเป็นร่างเพื่อแก้ไขและส่งใหม่')).toBeVisible();
    await context.close();
  });

  test('Change Manager: จัดตาราง → เริ่ม → ปิดงานสำเร็จ (ต้องมีผลลัพธ์)', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'changeManager');
    await page.goto('/changes/CHG-3381');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'จัดตารางดำเนินการ' }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('4. จัดตาราง');
    await page.getByRole('button', { name: 'เริ่มดำเนินการ' }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('5. ดำเนินการ');
    await waitHydrated(page);
    await page.getByLabel('ผลลัพธ์ / บันทึกการดำเนินการ').fill('แพตช์สำเร็จ ปรับ processes เป็น 2000');
    await page.getByRole('button', { name: 'ดำเนินการสำเร็จ' }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('6. เสร็จสิ้น');
    await expect(page.getByRole('heading', { name: 'ผลลัพธ์' })).toBeVisible();
    await expect(page.getByText('ไม่มีการดำเนินการที่ทำได้ในสถานะนี้')).toBeVisible();
    await context.close();
  });

  test('Standard Change อนุมัติล่วงหน้า ไม่ผ่าน CAB', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'agent');
    await page.goto('/changes/CHG-3370');
    await expect(page.getByText('Standard Change — อนุมัติล่วงหน้าตามนโยบาย')).toBeVisible();
    await context.close();
  });
});
