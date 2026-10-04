import { expect, test } from '@playwright/test';
import { authFile, expectNoHorizontalOverflow } from './helpers';

const PAGES = [
  { path: '/service-desk', title: 'Service Desk', group: 'ENGAGE', practice: 'Service Desk', related: 'Incident Management' },
  { path: '/monitoring', title: 'Monitoring & Event', group: 'DELIVER & SUPPORT', practice: 'Monitoring and Event Management', related: 'CMDB / Configuration' },
  { path: '/releases', title: 'Release Management', group: 'DESIGN & TRANSITION', practice: 'Release Management', related: 'Change Enablement' },
] as const;

test.describe('หน้าโมดูลที่ยังไม่พัฒนา', () => {
  test.use({ storageState: authFile('agent') });

  for (const p of PAGES) {
    test(`${p.path}: บอกชัดว่ายังไม่เปิดใช้งาน แสดงขอบเขต ITIL 4 และมีทางไปส่วนที่ใช้งานได้`, async ({ page }) => {
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: p.title })).toBeVisible();
      await expect(page.getByText(p.group).first()).toBeVisible();
      const notice = page.getByRole('status').filter({ hasText: 'ยังไม่เปิดใช้งาน' });
      await expect(notice).toContainText('ยังใช้งานจริงไม่ได้');
      await expect(page.getByText(p.practice).first()).toBeVisible();
      expect(await page.getByTestId('planned').getByRole('listitem').count()).toBeGreaterThanOrEqual(3);
      await expect(page.getByTestId('related').getByRole('link', { name: p.related })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('คลิกจากเมนูด้านข้างได้ และลิงก์ที่เกี่ยวข้องพาไปหน้าที่ใช้งานได้จริง', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'Monitoring & Event' }).click();
    await expect(page).toHaveURL(/\/monitoring$/);
    await page.getByTestId('related').getByRole('link', { name: 'CMDB / Configuration' }).click();
    await expect(page).toHaveURL(/\/cmdb$/);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('พาธย่อยหรือพาธนอกเมนูเป็น 404 (ไม่ตอบเป็นหน้าโมดูลหลอก)', async ({ page }) => {
    for (const p of ['/releases/REL-1', '/ไม่มีหน้านี้', '/monitoring/events', '/releases/x/y']) {
      expect((await page.goto(p))?.status(), p).toBe(404);
    }
  });
});

test.describe('สิทธิ์', () => {
  test.use({ storageState: authFile('endUser') });

  test('ผู้ใช้ปลายทางเข้าหน้าโมดูลเจ้าหน้าที่ไม่ได้ (ถูกส่งกลับพอร์ทัล)', async ({ page }) => {
    for (const p of PAGES) {
      await page.goto(p.path);
      await expect(page, p.path).toHaveURL(/\/portal$/);
    }
  });
});
