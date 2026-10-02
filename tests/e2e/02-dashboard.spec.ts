import { expect, test } from '@playwright/test';
import { authFile, num } from './helpers';

test.use({ storageState: authFile('agent') });

const dataRows = (page: import('@playwright/test').Page) => page.getByRole('row').filter({ has: page.getByRole('cell') });

test.describe('แดชบอร์ด /', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ส่วนหัว ผู้ใช้ และเมนูจัดกลุ่มตาม Service Value Chain', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'แดชบอร์ดบริหารจัดการบริการ IT' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
    for (const g of ['ENGAGE · มีส่วนร่วม', 'DELIVER & SUPPORT · ส่งมอบและสนับสนุน', 'DESIGN & TRANSITION · ออกแบบและเปลี่ยนผ่าน', 'OBTAIN / BUILD · จัดหาและสร้าง', 'PLAN & IMPROVE · วางแผนและปรับปรุง']) {
      await expect(nav.getByText(g)).toBeVisible();
    }
    await expect(nav.getByText('สมศักดิ์ ชื่นใจ')).toBeVisible();
    await expect(nav.getByRole('link', { name: /แดชบอร์ด/ })).toHaveAttribute('aria-current', 'page');
  });

  test('KPI 6 ช่อง: Incident เปิดอยู่ 42 และ P1 จำนวน 2', async ({ page }) => {
    const kpis = page.locator('section[aria-label="ตัวชี้วัดหลัก"] > div');
    await expect(kpis).toHaveCount(6);
    const incident = kpis.filter({ hasText: 'Incident เปิดอยู่' });
    await expect(incident).toContainText('42');
    await expect(incident).toContainText('P1 จำนวน 2 รายการ');
    await expect(kpis.filter({ hasText: 'บรรลุ SLA' })).toContainText('%');
    await expect(kpis.filter({ hasText: 'MTTR เฉลี่ย' })).toContainText('ชม.');
  });

  test('ห่วงโซ่คุณค่า 6 กิจกรรม', async ({ page }) => {
    const chain = page.locator('section', { has: page.getByRole('heading', { name: /ห่วงโซ่คุณค่าบริการ/ }) });
    for (const en of ['01 · Plan', '02 · Improve', '03 · Engage', '04 · Design & Transition', '05 · Obtain / Build', '06 · Deliver & Support']) {
      await expect(chain.getByText(en)).toBeVisible();
    }
  });

  test('คิว Incident เรียงตาม priority: INC-24817 (P1, Major) อยู่บนสุด', async ({ page }) => {
    await expect(dataRows(page)).toHaveCount(6);
    const first = dataRows(page).first();
    await expect(first).toContainText('INC-24817');
    await expect(first).toContainText('P1 วิกฤต');
    await expect(first).toContainText('Major Incident');
  });

  test('ตัวกรอง "ของฉัน" และ "ใกล้ผิด SLA" แสดงจำนวนตรงกับรายการ', async ({ page }) => {
    const filters = page.getByRole('navigation', { name: 'กรองคิว Incident' });
    await expect(filters.getByRole('link', { name: /ทั้งหมด 42/ })).toHaveAttribute('aria-current', 'true');

    await filters.getByRole('link', { name: /ของฉัน/ }).click();
    await expect(page).toHaveURL(/filter=mine/);
    const mine = num(await filters.getByRole('link', { name: /ของฉัน/ }).textContent());
    expect(mine).toBe(7);
    await expect(dataRows(page)).toHaveCount(Math.min(mine, 6));

    await filters.getByRole('link', { name: /ใกล้ผิด SLA/ }).click();
    const near = num(await filters.getByRole('link', { name: /ใกล้ผิด SLA/ }).textContent());
    expect(near).toBeGreaterThan(0);
    await expect(dataRows(page)).toHaveCount(Math.min(near, 6));
  });

  test('เมทริกซ์ priority: ผลรวมทุกช่องเท่ากับจำนวน Incident เปิดอยู่', async ({ page }) => {
    const matrix = page.locator('section', { has: page.getByRole('heading', { name: 'เมทริกซ์ลำดับความสำคัญ' }) });
    const counts = await matrix.locator('span.font-mono').allTextContents();
    expect(counts).toHaveLength(9);
    expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBe(42);
  });

  test('สถานะบริการแสดงเป็นข้อความด้วย (ไม่พึ่งสีอย่างเดียว)', async ({ page }) => {
    const card = page.locator('section', { has: page.getByRole('heading', { name: 'สถานะบริการ' }) });
    await expect(card).toContainText('ขัดข้อง');
    await expect(card).toContainText('เสื่อมประสิทธิภาพ');
    await expect(card).toContainText('ปกติ');
  });

  test('แถบ SLA ตามบริการ (ERP ต่ำกว่าเป้า 95%)', async ({ page }) => {
    const card = page.locator('section', { has: page.getByRole('heading', { name: /ผลการดำเนินงานตาม SLA/ }) });
    await expect(card.getByText('ERP', { exact: true })).toBeVisible();
    await expect(card.getByText('91.4%')).toBeVisible();
    await expect(card.getByRole('img', { name: 'เป้าหมาย 95%' })).toHaveCount(5);
  });

  test('ลิงก์จากคิวไปหน้า Incident และเมนูไปหน้าอื่นได้', async ({ page }) => {
    await page.getByRole('link', { name: 'INC-24817' }).first().click();
    await expect(page).toHaveURL(/\/incidents\/INC-24817$/);
    await page.goto('/');
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: /CMDB/ }).click();
    await expect(page).toHaveURL(/\/cmdb$/);
  });
});
