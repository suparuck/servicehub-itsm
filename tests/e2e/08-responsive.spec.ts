import { expect, test } from '@playwright/test';
import { authFile, expectNoHorizontalOverflow } from './helpers';

// มือถือ 375px: ไม่เลื่อนแนวนอน และปุ่ม/ลิงก์/ช่องกรอกสูงอย่างน้อย 44px (ข้ามลิงก์ breadcrumb ในส่วนหัว)
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

const staffPages = ['/service-desk', '/service-desk/new', '/improvement', '/improvement/IMP-0001', '/assets', '/assets/ASSET-LIC-0101', '/catalogue', '/catalogue/ERP', '/', '/incidents', '/incidents/INC-24817', '/incidents/new', '/cmdb', '/cmdb/CI-DB-00217', '/problems', '/problems/PRB-0412', '/changes', '/changes?view=calendar', '/changes/CHG-3381', '/knowledge', '/knowledge/KB-1187', '/sla', '/requests', '/requests/REQ-10291', '/account'];
const portalPages = ['/portal', '/portal/catalog', '/portal/knowledge', '/portal/my', '/portal/my/REQ-10291', '/portal/incident/new', '/portal/request/new', '/portal/status', '/account'];

async function smallTargets(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const sel = 'a,button,select,textarea,input:not([type=checkbox]):not([type=radio]):not([type=hidden])';
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((e) => e.offsetParent && !e.closest('header') && !e.closest('nav[aria-label="เมนูหลัก"]') && !e.classList.contains('sr-only'))
      .filter((e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 43.5)
      .map((e) => (e.innerText || (e as HTMLInputElement).name || e.id).slice(0, 30));
  });
}

test.describe('เจ้าหน้าที่ (มือถือ)', () => {
  test.use({ storageState: authFile('agent') });
  for (const path of staffPages) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(await smallTargets(page), 'เป้าสัมผัสเล็กกว่า 44px').toEqual([]);
    });
  }
});

test.describe('ผู้ใช้ปลายทาง (มือถือ)', () => {
  test.use({ storageState: authFile('endUser') });
  for (const path of portalPages) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(await smallTargets(page), 'เป้าสัมผัสเล็กกว่า 44px').toEqual([]);
    });
  }
});

test.describe('ผู้ดูแลระบบ (มือถือ)', () => {
  test.use({ storageState: authFile('admin') });
  for (const path of ['/admin/users', '/admin/users/new']) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(await smallTargets(page), 'เป้าสัมผัสเล็กกว่า 44px').toEqual([]);
    });
  }
});
