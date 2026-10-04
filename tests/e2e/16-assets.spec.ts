import { expect, test, type Page } from '@playwright/test';
import { alert, asRole, authFile, waitHydrated } from './helpers';

const tile = (page: Page, label: string) => page.getByTestId('tiles').getByRole('link', { name: new RegExp(`^${label}`) });
const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
/** เลือก CI จากรายการตามชื่อ (ค่าของตัวเลือกคือ ciId ซึ่งไม่รู้ล่วงหน้า) */
async function pickCi(page: Page, name: string) {
  const select = page.getByLabel(/CI ที่จะขึ้นทะเบียน/);
  await select.selectOption((await select.locator('option', { hasText: name }).getAttribute('value'))!);
}
const holder = 'มณีรัตน์ กิจเจริญ';

test.describe('IT Asset Management: ดูข้อมูล (สมาชิก CAB — ไม่มีสิทธิ์จัดการ)', () => {
  test.use({ storageState: authFile('cab') });

  test('สรุปตัวเลขตามข้อมูลตัวอย่าง และกดการ์ดเพื่อกรอง', async ({ page }) => {
    await page.goto('/assets');
    await expect(page.getByRole('heading', { level: 1, name: 'IT Asset Management' })).toBeVisible();
    await expect(tile(page, 'ทั้งหมด')).toContainText('7');
    await expect(tile(page, 'ใช้งานอยู่')).toContainText('6');
    await expect(tile(page, 'ส่งซ่อม')).toContainText('1');
    await expect(tile(page, 'ประกัน/ไลเซนส์ใกล้หมด')).toContainText('2');
    await expect(tile(page, 'หมดอายุแล้ว')).toContainText('1');
    await expect(tile(page, 'ไลเซนส์ใช้เกินสิทธิ์')).toContainText('1');
    await expect(page.getByRole('link', { name: '+ รับสินทรัพย์' })).toHaveCount(0);

    await tile(page, 'หมดอายุแล้ว').click();
    await expect(page).toHaveURL(/support=expired/);
    await expect(page.getByText('พบ 1 รายการ')).toBeVisible();
    await expect(rowOf(page, 'ASSET-NET-0120')).toContainText('หมดอายุแล้ว');
  });

  test('ตัวกรองประเภท สถานะ และค้นหา', async ({ page }) => {
    await page.goto('/assets');
    await page.getByLabel('ประเภท').selectOption('SOFTWARE_LICENSE');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page.getByText('พบ 2 รายการ')).toBeVisible();
    await expect(rowOf(page, 'ASSET-LIC-0101')).toContainText('ใช้เกินสิทธิ์'); // สีไม่ใช่ตัวบอกอย่างเดียว มีข้อความกำกับ
    await expect(rowOf(page, 'ASSET-LIC-0100')).toContainText('ใกล้เต็ม');

    await page.goto('/assets?status=IN_REPAIR');
    await expect(page.getByText('พบ 1 รายการ')).toBeVisible();
    await expect(rowOf(page, 'ASSET-EUD-1937')).toContainText('ส่งซ่อม');

    await page.goto('/assets');
    await page.getByPlaceholder(/ค้นหาแท็ก/).fill('lenovo');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page.getByText('พบ 1 รายการ')).toBeVisible();
    await expect(rowOf(page, 'ASSET-EUD-1936')).toContainText(holder);
  });

  test('รายละเอียด: ไลเซนส์ใช้เกินสิทธิ์; อุปกรณ์มีผู้ถือครอง; แก้ไขไม่ได้ และเข้าหน้ารับสินทรัพย์ไม่ได้', async ({ page }) => {
    await page.goto('/assets/ASSET-LIC-0101');
    await expect(page.getByText('ใช้เกินสิทธิ์ · ใช้ 52 จาก 50 สิทธิ์')).toBeVisible();
    await expect(page.getByLabel('ผู้ขาย/ผู้ผลิต')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เปลี่ยนสถานะ' })).toHaveCount(0);
    await page.goto('/assets/ASSET-EUD-1936');
    await expect(page.getByTestId('holder')).toContainText(holder);
    expect((await page.goto('/assets/new'))?.status()).toBe(404);
    expect((await page.goto('/assets/ASSET-NOPE-0001'))?.status()).toBe(404);
  });

  test('CSV: ชนิดไฟล์ BOM หัวตาราง และข้อมูลตรงกับตัวกรอง', async ({ page }) => {
    const res = await page.request.get('/assets/export?cls=SOFTWARE_LICENSE');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    expect(res.headers()['content-disposition']).toMatch(/servicehub-assets-\d{4}-\d{2}-\d{2}\.csv/);
    const body = await res.text();
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain('แท็ก,CI,ชื่อ');
    expect(body).toContain('ASSET-LIC-0101');
    expect(body).toContain('ใช้เกินสิทธิ์');
    expect(body).not.toContain('ASSET-EUD-1936'); // ถูกกรองออกตามประเภท
  });

  test('CMDB ลิงก์ไปยังสินทรัพย์ของ CI', async ({ page }) => {
    await page.goto('/cmdb/CI-DB-00217');
    await page.getByRole('link', { name: 'ASSET-SRV-0891' }).click();
    await expect(page).toHaveURL(/\/assets\/ASSET-SRV-0891$/);
    await expect(page.getByLabel('Serial No.')).toHaveValue('DL-7XK2M93');
  });
});

test.describe.serial('IT Asset Management: วงจรสินทรัพย์ (เจ้าหน้าที่)', () => {
  test.use({ storageState: authFile('agent') });
  let tag = '';
  let fields: Record<string, string> = {};

  test('รับเข้าทะเบียน: ข้อมูลผิดถูกปฏิเสธ แล้วรับเข้าสำเร็จ (CI นั้นหายจากรายการที่รอขึ้นทะเบียน)', async ({ page }) => {
    await page.goto('/assets');
    await page.getByRole('link', { name: '+ รับสินทรัพย์' }).click();
    await waitHydrated(page);
    await pickCi(page, 'NB-HR-0044');
    await page.getByLabel('มูลค่า (บาท)').fill('abc');
    await page.getByRole('button', { name: 'รับเข้าทะเบียน' }).click();
    await expect(alert(page)).toContainText('มูลค่า');

    await pickCi(page, 'NB-HR-0044');
    await page.getByLabel('มูลค่า (บาท)').fill('35000');
    await page.getByLabel('ผู้ขาย/ผู้ผลิต').fill('E2E Vendor');
    await page.getByLabel('Serial No.').fill('E2E-SN-001');
    await page.getByLabel('วันที่ซื้อ').fill('2026-09-01');
    await page.getByLabel(/สิ้นสุดประกัน\/MA/).fill('2029-09-01');
    await page.getByRole('button', { name: 'รับเข้าทะเบียน' }).click();
    await expect(page).toHaveURL(/\/assets\/ASSET-EUD-\d{4}$/);
    tag = page.url().split('/').pop()!;
    await expect(page.getByText('ในคลัง').first()).toBeVisible();
    await expect(page.getByText(/รับสินทรัพย์เข้าทะเบียน ASSET-EUD/)).toBeVisible();

    await page.goto('/assets/new');
    await expect(page.getByLabel(/CI ที่จะขึ้นทะเบียน/).locator('option', { hasText: 'NB-HR-0044' })).toHaveCount(0);
  });

  test('แก้ไขข้อมูล → บันทึกในประวัติสินทรัพย์', async ({ page }) => {
    await page.goto(`/assets/${tag}`);
    // เก็บฟิลด์ของฟอร์ม "เปลี่ยนสถานะ" ไว้ใช้ในเคสปลอม request (ก่อน hydrate เหมือน 07-permissions)
    fields = await page.evaluate(() => {
      const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('select[name=to]'))!;
      return Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((i) => [i.name, i.value]));
    });
    expect(Object.keys(fields).length, 'ต้องมีฟิลด์ $ACTION_* ของฟอร์ม').toBeGreaterThan(0);
    await waitHydrated(page);
    await page.getByLabel('สถานที่').fill('คลังชั้น 2');
    await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()]);
    await expect(page.getByText(/สถานที่: — → คลังชั้น 2/)).toBeVisible();
  });

  test('Server Action ปลอม: สมาชิก CAB POST ฟอร์มเปลี่ยนสถานะของเจ้าหน้าที่ → ไม่มีผล (เคสควบคุม: เจ้าหน้าที่ POST แล้วสำเร็จ)', async ({ browser }) => {
    const multipart = { ...fields, to: 'IN_REPAIR', note: 'ปลอม' };
    const cab = await asRole(browser, 'cab');
    await cab.page.request.post(`/assets/${tag}`, { multipart, maxRedirects: 0, failOnStatusCode: false });
    await cab.page.goto(`/assets/${tag}`);
    await expect(cab.page.getByText('ในคลัง').first()).toBeVisible();
    await cab.context.close();

    const agent = await asRole(browser, 'agent');
    const res = await agent.page.request.post(`/assets/${tag}`, { multipart, maxRedirects: 0, failOnStatusCode: false });
    expect(res.status(), 'ฟอร์มที่ปลอมต้องใช้งานได้เมื่อผู้เรียกมีสิทธิ์').toBe(303);
    await agent.page.goto(`/assets/${tag}`);
    await expect(agent.page.getByText('ส่งซ่อม').first()).toBeVisible();
    await agent.context.close();
  });

  test('เปลี่ยนเป็นใช้งานอยู่: อุปกรณ์ผู้ใช้ต้องระบุผู้ถือครอง → ส่งซ่อมยังคงผู้ถือครอง → กลับคลังแล้วล้างผู้ถือครอง', async ({ page }) => {
    await page.goto(`/assets/${tag}`);
    await waitHydrated(page);
    await page.getByLabel('สถานะถัดไป').selectOption('IN_USE');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(alert(page)).toContainText('ต้องระบุผู้ถือครอง');

    await waitHydrated(page);
    await page.getByLabel('สถานะถัดไป').selectOption('IN_USE');
    await page.getByLabel(/^ผู้ถือครอง/).selectOption({ label: holder });
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByTestId('holder')).toContainText(holder);

    await waitHydrated(page);
    await page.getByLabel('สถานะถัดไป').selectOption('IN_REPAIR');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByTestId('holder')).toContainText(holder); // ซ่อมแล้วยังเป็นของผู้ถือครองเดิม

    await waitHydrated(page);
    await page.getByLabel('สถานะถัดไป').selectOption('IN_STOCK');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByTestId('holder')).toContainText('ไม่มีผู้ถือครอง');
    await expect(page.getByText(`คืนจาก ${holder}`)).toBeVisible();
  });

  test('ปลดระวาง: CI ใน CMDB ถูกตั้งเป็นปลดระวาง และสินทรัพย์แก้ไข/เปลี่ยนสถานะไม่ได้อีก', async ({ page }) => {
    await page.goto(`/assets/${tag}`);
    await waitHydrated(page);
    await page.getByLabel('สถานะถัดไป').selectOption('RETIRED');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'ปลดระวางแล้ว' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เปลี่ยนสถานะ' })).toHaveCount(0);
    await expect(page.getByLabel('ผู้ขาย/ผู้ผลิต')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toHaveCount(0);

    await page.goto('/cmdb/CI-EUD-1938');
    await expect(page.getByText('ปลดระวาง').first()).toBeVisible();
    await expect(page.getByText(/สถานะ: ใช้งานจริง → ปลดระวาง/)).toBeVisible(); // ประวัติการเปลี่ยนแปลงของ CI
  });
});
