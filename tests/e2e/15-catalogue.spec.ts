import { expect, test, type Page } from '@playwright/test';
import { alert, asRole, authFile, waitHydrated } from './helpers';

const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });

test.describe('Service Catalogue: ดูข้อมูล (เจ้าหน้าที่ทั่วไป)', () => {
  test.use({ storageState: authFile('agent') });

  test('ทะเบียนบริการ: ค้นหา กรองหมวดหมู่และสถานะ', async ({ page }) => {
    await page.goto('/catalogue');
    await expect(page.getByRole('heading', { level: 1, name: 'Service Catalogue' })).toBeVisible();
    await expect(page.getByText(/พบ \d+ บริการ/)).toBeVisible();
    await expect(page.getByRole('link', { name: '+ เพิ่มบริการ' })).toHaveCount(0); // ไม่มีสิทธิ์จัดการ
    await expect(rowOf(page, 'ERP').first()).toContainText('ขัดข้อง');

    await page.getByPlaceholder('ค้นหารหัส ชื่อ เจ้าของ หรือหมวดหมู่').fill('vpn');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page).toHaveURL(/q=vpn/);
    await expect(page.getByRole('link', { name: 'VPN', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ERP', exact: true })).toHaveCount(0);

    await page.goto('/catalogue');
    await page.getByLabel('สถานะบริการ').selectOption('DOWN');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page.getByRole('link', { name: 'ERP', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'M365', exact: true })).toHaveCount(0);
  });

  test('รายละเอียดบริการ: ข้อเสนอ SLA และงานที่เปิดอยู่ แต่แก้ไขไม่ได้', async ({ page }) => {
    await page.goto('/catalogue/ERP');
    await expect(page.getByRole('heading', { level: 1, name: 'ERP' })).toBeVisible();
    await expect(page.getByTestId('offerings').getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('table', { name: 'เป้าหมาย SLA ของ Incident' }).getByRole('row')).toHaveCount(5); // หัวตาราง + P1–P4
    await expect(page.getByTestId('related-work').getByRole('link', { name: 'INC-24817' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เพิ่มข้อเสนอ' })).toHaveCount(0);
    await expect(page.getByLabel('ชื่อบริการ')).toBeDisabled();
    for (const p of ['/catalogue/new']) expect((await page.goto(p))?.status(), p).toBe(404);
    expect((await page.goto('/catalogue/NOPE'))?.status()).toBe(404);
  });
});

test.describe.serial('Service Catalogue: จัดการบริการ ข้อเสนอ และรายการพอร์ทัล (หัวหน้าทีม)', () => {
  test.use({ storageState: authFile('lead') });
  const code = 'E2E-SVC';
  let fields: Record<string, string> = {};

  test('เพิ่มบริการ: รหัสผิดรูปแบบและรหัสซ้ำถูกปฏิเสธ แล้วเพิ่มสำเร็จ', async ({ page }) => {
    await page.goto('/catalogue');
    await page.getByRole('link', { name: '+ เพิ่มบริการ' }).click();
    await waitHydrated(page);
    await page.getByLabel(/รหัสบริการ/).fill('bad code!');
    await page.getByLabel(/ชื่อบริการ/).fill('E2E บริการทดสอบ');
    await page.getByRole('button', { name: 'เพิ่มบริการ' }).click();
    await expect(alert(page)).toContainText('รหัสบริการต้องเป็นตัวพิมพ์ใหญ่');

    await page.getByLabel(/รหัสบริการ/).fill('erp');
    await page.getByLabel(/ชื่อบริการ/).fill('ซ้ำ');
    await page.getByRole('button', { name: 'เพิ่มบริการ' }).click();
    await expect(alert(page)).toContainText('รหัสบริการ ERP มีอยู่แล้ว');

    await page.getByLabel(/รหัสบริการ/).fill(code.toLowerCase());
    await page.getByLabel(/ชื่อบริการ/).fill('E2E บริการทดสอบ');
    await page.getByLabel('เจ้าของบริการ').fill('ทีม E2E');
    await page.getByLabel('หมวดหมู่').fill('ทดสอบ');
    await page.getByLabel('SLA ที่ผูก').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'เพิ่มบริการ' }).click();
    await expect(page).toHaveURL(new RegExp(`/catalogue/${code}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'E2E บริการทดสอบ' })).toBeVisible();
    await expect(page.getByText(`เพิ่มบริการ ${code}`)).toBeVisible(); // ประวัติการแก้ไข
  });

  test('แก้ไขข้อมูลบริการ → บันทึกในประวัติ และสะท้อนในทะเบียน', async ({ page }) => {
    await page.goto(`/catalogue/${code}`);
    await waitHydrated(page);
    await page.getByLabel('เจ้าของบริการ').fill('ทีม E2E ใหม่');
    await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()]);
    await expect(page.getByText(/เจ้าของ: ทีม E2E → ทีม E2E ใหม่/)).toBeVisible();
    await page.goto('/catalogue?q=E2E-SVC');
    await expect(rowOf(page, code)).toContainText('ทีม E2E ใหม่');
  });

  test('ข้อเสนอบริการ: เพิ่ม ชื่อซ้ำถูกปฏิเสธ และลบได้', async ({ page }) => {
    await page.goto(`/catalogue/${code}`);
    // เก็บฟิลด์ของฟอร์ม "เพิ่มข้อเสนอ" ไว้ใช้ในเคสปลอม request ถัดไป (ก่อน hydrate เหมือน 07-permissions)
    fields = await page.evaluate(() => {
      const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('input[name=description]'))!;
      return Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((i) => [i.name, i.value]));
    });
    expect(Object.keys(fields).length, 'ต้องมีฟิลด์ $ACTION_* ของฟอร์ม').toBeGreaterThan(0);
    await waitHydrated(page);
    await page.getByLabel('ชื่อข้อเสนอ').fill('ข้อเสนอ A');
    await page.getByLabel('คำอธิบาย', { exact: true }).fill('รายละเอียด A');
    await page.getByRole('button', { name: 'เพิ่มข้อเสนอ' }).click();
    await expect(page.getByTestId('offerings').getByRole('listitem')).toHaveCount(1);

    await waitHydrated(page);
    await page.getByLabel('ชื่อข้อเสนอ').fill('ข้อเสนอ a');
    await page.getByRole('button', { name: 'เพิ่มข้อเสนอ' }).click();
    await expect(alert(page)).toContainText('มีข้อเสนอบริการชื่อนี้');


    await page.goto(`/catalogue/${code}`);
    await waitHydrated(page);
    await page.getByRole('button', { name: 'ลบ ข้อเสนอ A' }).click();
    await expect(page.getByTestId('offerings')).toHaveCount(0);
    await expect(page.getByText('ยังไม่มีข้อเสนอบริการ')).toBeVisible();
  });

  test('Server Action ปลอม: เจ้าหน้าที่ทั่วไป POST ฟอร์มเพิ่มข้อเสนอของหัวหน้าทีม → ไม่มีผล (เคสควบคุม: หัวหน้าทีม POST แล้วสำเร็จ)', async ({ browser }) => {
    const multipart = { ...fields, name: 'ข้อเสนอปลอม', description: 'x' };
    const agent = await asRole(browser, 'agent');
    await agent.page.request.post(`/catalogue/${code}`, { multipart, maxRedirects: 0, failOnStatusCode: false });
    await agent.page.goto(`/catalogue/${code}`);
    await expect(agent.page.getByText('ยังไม่มีข้อเสนอบริการ')).toBeVisible();
    await agent.context.close();

    const lead = await asRole(browser, 'lead');
    const res = await lead.page.request.post(`/catalogue/${code}`, { multipart, maxRedirects: 0, failOnStatusCode: false });
    expect(res.status(), 'ฟอร์มที่ปลอมต้องใช้งานได้เมื่อผู้เรียกมีสิทธิ์').toBe(303);
    await lead.page.goto(`/catalogue/${code}`);
    await expect(lead.page.getByTestId('offerings').getByText('ข้อเสนอปลอม')).toBeVisible();
    await lead.page.getByRole('button', { name: 'ลบ ข้อเสนอปลอม' }).click();
    await expect(lead.page.getByText('ยังไม่มีข้อเสนอบริการ')).toBeVisible();
    await lead.context.close();
  });

  test('รายการพอร์ทัล: ข้อมูลไม่ครบถูกปฏิเสธ → เพิ่มแล้วผู้ใช้เห็น → ซ่อนแล้วหาย → เผยแพร่คืนมา', async ({ page, browser }) => {
    await page.goto(`/catalogue/${code}`);
    await waitHydrated(page);
    await page.getByTestId('items').getByLabel('ชื่อรายการ').count(); // ยังไม่มีรายการ
    const add = page.locator('form').filter({ has: page.getByRole('button', { name: 'เพิ่มรายการ' }) });
    await add.getByLabel('ชื่อรายการ').fill('E2E รายการขอ');
    // ฟิลด์จำเป็นไม่ครบ: เบราว์เซอร์กันไม่ให้ส่ง (การตรวจฝั่งเซิร์ฟเวอร์ครอบคลุมใน unit test ของ validateCatalogItem)
    await add.getByRole('button', { name: 'เพิ่มรายการ' }).click();
    await expect(add.getByLabel('ตัวอย่างสิ่งที่ขอได้')).toHaveJSProperty('validity.valueMissing', true);
    await expect(page.getByTestId('items').getByRole('listitem')).toHaveCount(0);

    const add2 = page.locator('form').filter({ has: page.getByRole('button', { name: 'เพิ่มรายการ' }) });
    await add2.getByLabel('ชื่อรายการ').fill('E2E รายการขอ');
    await add2.getByLabel('ตัวอย่างสิ่งที่ขอได้').fill('ของทดสอบ E2E');
    await add2.getByLabel('ระยะเวลาส่งมอบ').fill('ภายใน 2 วันทำการ');
    await add2.getByRole('button', { name: 'เพิ่มรายการ' }).click();
    await expect(page.getByTestId('items').getByText('เผยแพร่ในพอร์ทัล')).toBeVisible();

    const user = await asRole(browser, 'endUser');
    await user.page.goto('/portal/catalog');
    await expect(user.page.getByRole('link', { name: /E2E รายการขอ/ })).toBeVisible();

    await waitHydrated(page);
    await page.getByRole('button', { name: 'ซ่อน E2E รายการขอ' }).click();
    await expect(page.getByTestId('items').getByText('ซ่อนจากพอร์ทัล')).toBeVisible();
    await user.page.goto('/portal/catalog');
    await expect(user.page.getByRole('link', { name: /E2E รายการขอ/ })).toHaveCount(0);
    await user.page.goto('/portal/request/new');
    await expect(user.page.getByLabel(/ประเภทบริการ/).locator('option', { hasText: 'E2E รายการขอ' })).toHaveCount(0);

    await waitHydrated(page);
    await page.getByRole('button', { name: 'เผยแพร่ E2E รายการขอ' }).click();
    await expect(page.getByTestId('items').getByText('เผยแพร่ในพอร์ทัล')).toBeVisible();
    await user.page.goto('/portal/catalog');
    await expect(user.page.getByRole('link', { name: /E2E รายการขอ/ })).toBeVisible();
    await user.context.close();
  });

  test('รายการที่มีคำขออ้างอิงลบไม่ได้ (ให้ซ่อนแทน) ส่วนรายการที่ไม่มีคำขอลบได้', async ({ page, browser }) => {
    const user = await asRole(browser, 'endUser');
    await user.page.goto('/portal/request/new');
    await waitHydrated(user.page);
    await user.page.getByLabel(/ประเภทบริการ/).selectOption({ label: 'E2E รายการขอ' });
    await user.page.getByLabel(/สิ่งที่ต้องการ/).fill('E2E: ขอจากรายการใหม่');
    await user.page.getByRole('button', { name: /ส่งคำขอ/ }).click();
    await expect(user.page).toHaveURL(/\/portal\/my\/REQ-\d+$/);
    await user.context.close();

    await page.goto(`/catalogue/${code}`);
    await waitHydrated(page);
    await expect(page.getByTestId('items')).toContainText('1 คำขอ');
    await page.getByRole('button', { name: 'ลบ E2E รายการขอ' }).click();
    await expect(alert(page)).toContainText('ลบไม่ได้');
    await expect(page.getByTestId('items')).toContainText('E2E รายการขอ');
  });
});
