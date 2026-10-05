import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';
import { authFile, waitHydrated } from './helpers';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
const changes = (page: Page) => page.getByText(/สถานะบริการเปลี่ยน:/);

test.describe.serial('สุขภาพบริการจากเหตุการณ์ Monitoring', () => {
  test.use({ storageState: authFile('admin') });
  let api: APIRequestContext;
  let token = '';
  const post = (body: unknown) =>
    api.post('/api/monitoring/events', { data: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, failOnStatusCode: false });
  const health = async (page: Page, code: string, name: string, text: string) => {
    await page.goto(`/catalogue?q=${code}`);
    await expect(rowOf(page, name)).toContainText(text);
  };

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL });
  });
  test.afterAll(async () => { await api.dispose(); });

  test('เตรียม: สร้างแหล่งเหตุการณ์ และบริการ BI เริ่มต้นเป็น "ปกติ" ไม่มีเหตุการณ์ที่กำหนดสถานะ', async ({ page }) => {
    await page.goto('/monitoring/sources');
    await waitHydrated(page);
    await page.getByLabel('ชื่อแหล่ง').fill('E2E Health');
    await page.getByRole('button', { name: 'เพิ่มแหล่ง' }).click();
    token = ((await page.getByTestId('source-token').textContent()) ?? '').trim();
    expect(token).toMatch(/^shm_/);
    await health(page, 'BI', 'Business Intelligence', 'ปกติ');
    await page.goto('/catalogue/BI');
    await expect(page.getByText('ไม่มีเหตุการณ์เฝ้าระวังที่ยังไม่ปิดสำหรับบริการนี้')).toBeVisible();
    await expect(changes(page)).toHaveCount(0);
  });

  test('เตือน (รหัสบริการตัวพิมพ์เล็ก) → ช้า/บางส่วน; เหตุการณ์ซ้ำไม่บันทึกประวัติซ้ำ; เห็นเหตุการณ์ที่กำหนดสถานะ', async ({ page }) => {
    for (let i = 0; i < 2; i++) expect((await post({ check: 'e2e_bi_slow', service: 'bi', severity: 'warning', message: `ช้า ${i}` })).status()).toBe(202);
    await health(page, 'BI', 'Business Intelligence', 'ช้า/บางส่วน');
    await page.goto('/catalogue/BI');
    await expect(page.getByTestId('health-events').getByRole('listitem').filter({ hasText: 'e2e_bi_slow' })).toContainText('2 ครั้ง');
    await expect(page.getByText('สถานะบริการเปลี่ยน: ปกติ → ช้า/บางส่วน (จากเหตุการณ์เฝ้าระวัง: e2e_bi_slow)')).toHaveCount(1);
    await page.getByRole('link', { name: 'ดูในหน้า Monitoring' }).click();
    await expect(page).toHaveURL(/\/monitoring\?service=BI/);
    await expect(page.getByRole('row').filter({ hasText: 'e2e_bi_slow' })).toBeVisible();
    await expect(page.getByText('เฉพาะบริการ BI')).toBeVisible();
  });

  test('ผิดปกติ → ขัดข้อง; รับทราบแล้วยังขัดข้อง (ปัญหายังอยู่)', async ({ page }) => {
    expect((await post({ check: 'e2e_bi_down', service: 'BI', severity: 'critical' })).status()).toBe(202);
    await health(page, 'BI', 'Business Intelligence', 'ขัดข้อง');
    await page.goto('/monitoring?service=BI');
    await waitHydrated(page);
    await page.getByRole('row').filter({ hasText: 'e2e_bi_down' }).getByRole('button', { name: /^รับทราบ/ }).click();
    await expect(page.getByRole('row').filter({ hasText: 'e2e_bi_down' })).toContainText('รับทราบแล้ว');
    await health(page, 'BI', 'Business Intelligence', 'ขัดข้อง');
  });

  test('ปิดเหตุการณ์ผิดปกติโดยแหล่ง (ok) → กลับเป็นช้า/บางส่วน; ปิดเตือนด้วยมือ → กลับเป็นปกติ; ประวัติครบ 4 ขั้น', async ({ page }) => {
    expect((await post({ check: 'e2e_bi_down', service: 'BI', severity: 'ok' })).status()).toBe(202);
    await health(page, 'BI', 'Business Intelligence', 'ช้า/บางส่วน');

    await page.goto('/monitoring?service=BI');
    await waitHydrated(page);
    await page.getByRole('row').filter({ hasText: 'e2e_bi_slow' }).getByRole('button', { name: /^ปิดเหตุการณ์/ }).click();
    await expect(page.getByRole('row').filter({ hasText: 'e2e_bi_slow' })).toHaveCount(0);
    await health(page, 'BI', 'Business Intelligence', 'ปกติ');

    await page.goto('/catalogue/BI');
    await expect(page.getByText('ไม่มีเหตุการณ์เฝ้าระวังที่ยังไม่ปิดสำหรับบริการนี้')).toBeVisible();
    await expect(changes(page)).toHaveCount(4); // ปกติ→ช้า, ช้า→ขัดข้อง, ขัดข้อง→ช้า, ช้า→ปกติ
    await expect(page.getByText(/ขัดข้อง → ช้า\/บางส่วน/)).toHaveCount(1);
    await expect(page.getByText(/ช้า\/บางส่วน → ปกติ/)).toHaveCount(1);
  });

  test('ส่งผิดปกติซ้ำพร้อมกัน 6 คำขอของ HR → ขัดข้อง และบันทึกประวัติการเปลี่ยนครั้งเดียว; ปกติกลับมาอีกครั้งเดียว', async ({ page }) => {
    const results = await Promise.all(Array.from({ length: 6 }, () => post({ check: 'e2e_hr_race', service: 'HR', severity: 'critical' })));
    for (const r of results) expect(r.status()).toBe(202);
    await health(page, 'HR', 'ระบบ HR', 'ขัดข้อง');
    await page.goto('/catalogue/HR');
    await expect(page.getByText(/ปกติ → ขัดข้อง/)).toHaveCount(1);
    expect((await post({ check: 'e2e_hr_race', service: 'HR', severity: 'ok' })).status()).toBe(202);
    await health(page, 'HR', 'ระบบ HR', 'ปกติ');
    await page.goto('/catalogue/HR');
    await expect(changes(page)).toHaveCount(2);
  });

  test('รหัสบริการที่ไม่มีในระบบ: รับเหตุการณ์ได้ปกติ ไม่กระทบบริการใด', async ({ page }) => {
    const r = await post({ check: 'e2e_nowhere', service: 'NOPE', severity: 'critical' });
    expect(r.status()).toBe(202);
    await page.goto('/monitoring?service=NOPE');
    await expect(page.getByRole('row').filter({ hasText: 'e2e_nowhere' })).toContainText('ผิดปกติ');
    await health(page, 'M365', 'Microsoft 365', 'ปกติ');
  });

  test('บริการที่ไม่เคยมีเหตุการณ์คงสถานะเดิมตามข้อมูลตัวอย่าง (VPN ช้า/บางส่วน)', async ({ page }) => {
    await health(page, 'VPN', 'Remote Access', 'ช้า/บางส่วน');
  });
});
