import { expect, test } from '@playwright/test';
import { authFile } from './helpers';

// เมนูทุกรายการต้องเปิดได้จริง (ไม่ 404) — โมดูลสุดท้ายที่เคยเป็น placeholder พัฒนาครบแล้ว
const MENU = ['แดชบอร์ด', 'Service Desk', 'พอร์ทัลบริการตนเอง', 'Incident Management', 'Service Request', 'Problem Management', 'Monitoring & Event', 'Change Enablement', 'ปฏิทิน Change & Problem', 'Release Management', 'Service Catalogue', 'CMDB / Configuration', 'IT Asset Management', 'Service Level Management', 'Knowledge Management', 'Continual Improvement'];

test.describe('เมนูหลัก', () => {
  test.use({ storageState: authFile('agent') });

  test('ทุกรายการในเมนูเปิดหน้าที่ใช้งานได้ ไม่มีหน้า "ยังไม่พัฒนา"', async ({ page }) => {
    for (const name of MENU) {
      await page.goto('/');
      await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link').filter({ hasText: name }).first().click();
      await expect(page.getByRole('heading', { level: 1 }).first(), name).toBeVisible();
      await expect(page.getByText('ยังไม่เปิดใช้งาน'), name).toHaveCount(0);
    }
  });

  test('พาธที่ไม่มีอยู่จริงเป็น 404 (ไม่ตอบเป็นหน้าหลอก)', async ({ page }) => {
    for (const p of ['/ไม่มีหน้านี้', '/releases/REL-9999', '/monitoring/events', '/service-desk/x/y']) expect((await page.goto(p))?.status(), p).toBe(404);
  });
});

test.describe('สิทธิ์', () => {
  test.use({ storageState: authFile('endUser') });

  test('ผู้ใช้ปลายทางเข้าหน้าเจ้าหน้าที่ไม่ได้ (ถูกส่งกลับพอร์ทัล)', async ({ page }) => {
    for (const p of ['/releases', '/assets', '/improvement', '/catalogue', '/monitoring', '/service-desk']) {
      await page.goto(p);
      await expect(page, p).toHaveURL(/\/portal$/);
    }
  });
});
