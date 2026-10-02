import { expect, test } from '@playwright/test';
import { alert, authFile, waitHydrated } from './helpers';

test.use({ storageState: authFile('agent') });

test.describe('CMDB', () => {
  test('KPI สุขภาพข้อมูล และคลาสของ CI', async ({ page }) => {
    await page.goto('/cmdb');
    const kpis = page.locator('section[aria-label="สุขภาพข้อมูล CMDB"] > div');
    await expect(kpis).toHaveCount(6);
    await expect(kpis.filter({ hasText: 'ความครอบคลุมของบริการ' })).toContainText('2/8');
    await expect(kpis.filter({ hasText: 'CI ไม่มีเจ้าของ' })).toContainText('2');
    const classes = page.getByRole('navigation', { name: 'คลาสของ CI' });
    await expect(classes.getByRole('link', { name: /Business Service/ })).toContainText('8');
  });

  test('ตัวกรองคลาส Database และค้นหาจาก IP ในคุณลักษณะ', async ({ page }) => {
    await page.goto('/cmdb');
    await page.getByRole('navigation', { name: 'คลาสของ CI' }).getByRole('link', { name: /^Database/ }).click();
    await expect(page).toHaveURL(/cls=DATABASE/);
    await expect(page.getByRole('row').filter({ has: page.getByRole('cell') })).toHaveCount(2);
    await page.goto('/cmdb?q=10.20.4.17');
    await expect(page.getByRole('link', { name: 'ERP-DB-02' })).toBeVisible();
  });

  test('งานคุณภาพข้อมูลกรองรายการ: ไม่มีเจ้าของ 2 รายการ', async ({ page }) => {
    await page.goto('/cmdb');
    await page.getByRole('link', { name: 'มอบหมายเจ้าของ' }).click();
    await expect(page).toHaveURL(/dq=noOwner/);
    await expect(page.getByText(/แสดง 2 จาก 2 รายการ/)).toBeVisible();
    await expect(page.getByText('กรองตามงานคุณภาพข้อมูล')).toBeVisible();
  });

  test('รายละเอียด ERP-DB-02: แผนผัง 4 ชั้น และวิเคราะห์ผลกระทบ', async ({ page }) => {
    await page.goto('/cmdb/CI-DB-00217');
    await expect(page.getByRole('heading', { name: 'ERP-DB-02', level: 2 })).toBeVisible();
    for (const t of ['BUSINESS SERVICE', 'APPLICATION', 'DATA / PLATFORM', 'INFRASTRUCTURE']) await expect(page.getByText(t, { exact: true })).toBeVisible();
    await expect(page.getByText('มี P1 เปิดอยู่')).toBeVisible();
    const impact = page.locator('div', { has: page.getByRole('heading', { name: /วิเคราะห์ผลกระทบ/ }) }).last();
    await expect(impact).toContainText('Business Service');
    await expect(impact).toContainText('2');
    await expect(page.getByRole('link', { name: /INC-24817/ }).first()).toBeVisible();
    await expect(page.getByText('ASSET-SRV-0891').first()).toBeVisible();
  });

  test('เพิ่มความสัมพันธ์ที่ทำให้วนลูปถูกปฏิเสธ', async ({ page }) => {
    await page.goto('/cmdb/CI-DB-00217');
    await waitHydrated(page);
    await page.getByLabel('ประเภท').selectOption('DEPENDS_ON');
    await page.getByLabel('CI ปลายทาง').selectOption({ label: 'ERP Production (CI-SVC-0003)' });
    await page.getByRole('button', { name: 'เพิ่มความสัมพันธ์' }).click();
    await expect(alert(page)).toContainText('วงวน');
  });

  test('สร้าง CI ใหม่ แก้ไข และยืนยันข้อมูล พร้อมบันทึกประวัติ', async ({ page }) => {
    await page.goto('/cmdb/new');
    await waitHydrated(page);
    await page.getByLabel(/ชื่อ CI/).fill('E2E-APP-01');
    await page.getByLabel('คลาส').selectOption('APPLICATION');
    await page.getByLabel('คุณลักษณะ').fill('IP Address: 10.99.0.1\nเวอร์ชัน: 1.0');
    await page.getByRole('button', { name: 'เพิ่ม CI' }).click();
    await expect(page).toHaveURL(/\/cmdb\/CI-APP-\d+$/);
    await expect(page.getByRole('heading', { name: 'E2E-APP-01', level: 2 })).toBeVisible();
    await expect(page.getByText('สร้าง CI')).toBeVisible();

    await page.getByRole('link', { name: 'แก้ไข', exact: true }).click();
    await waitHydrated(page);
    await page.getByLabel('คำอธิบายสั้น').fill('สร้างโดยชุดทดสอบ E2E');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page.getByText('สร้างโดยชุดทดสอบ E2E')).toBeVisible();

    await page.getByRole('button', { name: 'ยืนยันข้อมูลแล้ว' }).click();
    await expect(page.getByText('ยืนยันข้อมูลด้วยมือ')).toBeVisible();
  });

  test('Business Service ที่ผูกแผนผังแล้วลดจำนวน "ยังไม่มี Service Model"', async ({ page }) => {
    await page.goto('/cmdb?dq=noModel');
    await expect(page.getByText(/แสดง 6 จาก 6/)).toBeVisible();
    await page.goto('/cmdb/CI-SVC-0016');
    await waitHydrated(page);
    await page.getByLabel('CI ปลายทาง').selectOption({ label: 'ERP-APP-01 (CI-APP-0041)' });
    await page.getByRole('button', { name: 'เพิ่มความสัมพันธ์' }).click();
    await expect(page.getByText('ERP-APP-01').first()).toBeVisible();
    await page.goto('/cmdb?dq=noModel');
    await expect(page.getByText(/แสดง 5 จาก 5/)).toBeVisible();
  });
});
