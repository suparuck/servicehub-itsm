import { expect, test, type Page } from '@playwright/test';
import { alert, asRole, authFile, waitHydrated } from './helpers';

const tile = (page: Page, label: string) => page.getByTestId('tiles').getByRole('link', { name: new RegExp(`^${label}`) });
const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
const save = (page: Page, name: string) => Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name }).click()]);

test.describe('Continual Improvement: ดูข้อมูล (สมาชิก CAB — ไม่มีสิทธิ์จัดการ)', () => {
  test.use({ storageState: authFile('cab') });

  test('สรุปตัวเลข การกรอง และการแยกตามขั้นตอน', async ({ page }) => {
    await page.goto('/improvement');
    await expect(page.getByRole('heading', { level: 1, name: 'Continual Improvement' })).toBeVisible();
    await expect(tile(page, 'กำลังดำเนินการ')).toContainText('3');
    await expect(tile(page, 'เลยกำหนด')).toContainText('1');
    await expect(page.getByRole('link', { name: '+ เสนอรายการปรับปรุง' })).toHaveCount(0);
    await expect(page.getByTestId('by-step').getByRole('listitem')).toHaveCount(7);

    await tile(page, 'เลยกำหนด').click();
    await expect(page).toHaveURL(/overdue=1/);
    await expect(page.getByText('พบ 1 รายการ')).toBeVisible();
    await expect(rowOf(page, 'Chatbot')).toContainText('เลยกำหนด'); // มีข้อความกำกับ ไม่ใช้สีอย่างเดียว

    await page.goto('/improvement?status=OPEN&step=5');
    await expect(page.getByText('พบ 1 รายการ')).toBeVisible();
    await expect(rowOf(page, 'Swarming')).toContainText('ขั้นที่ 5/7');
  });

  test('รายละเอียด: ตัวติดตาม 7 ขั้น (ขั้นปัจจุบันมี aria-current) แก้ไขไม่ได้ และเข้าหน้าเสนอไม่ได้', async ({ page }) => {
    await page.goto('/improvement/IMP-0001');
    await expect(page.getByRole('heading', { level: 1, name: /Swarming/ })).toBeVisible();
    const tracker = page.getByRole('list', { name: 'ความคืบหน้าตามโมเดล 7 ขั้นของ ITIL 4' });
    await expect(tracker.getByRole('listitem')).toHaveCount(7);
    await expect(tracker.locator('[aria-current="step"]')).toContainText('ลงมือทำ');
    await expect(page.getByLabel(/หัวข้อการปรับปรุง/)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เปลี่ยนขั้น', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เปลี่ยนสถานะ' })).toHaveCount(0);
    expect((await page.goto('/improvement/new'))?.status()).toBe(404);
    expect((await page.goto('/improvement/IMP-9999'))?.status()).toBe(404);
    expect((await page.goto('/improvement/abc'))?.status()).toBe(404);
  });

  test('แดชบอร์ดยังแสดงทะเบียนการปรับปรุงที่กำลังดำเนินการ', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('ลด MTTR ของ P2 ลง 20% ด้วย Swarming')).toBeVisible();
    await expect(page.getByText('ขั้นที่ 5/7').first()).toBeVisible();
  });
});

test.describe.serial('Continual Improvement: วงจร 7 ขั้น (เจ้าหน้าที่)', () => {
  test.use({ storageState: authFile('agent') });
  const title = 'E2E ปรับปรุงการส่งต่อเรื่อง';
  let no = '';
  let fields: Record<string, string> = {};

  test('เสนอรายการใหม่ → เริ่มที่ขั้น 1 และตัวเลขบนเมนูเพิ่มเป็น 4', async ({ page }) => {
    await page.goto('/improvement');
    await page.getByRole('link', { name: '+ เสนอรายการปรับปรุง' }).click();
    await waitHydrated(page);
    await page.getByLabel(/หัวข้อการปรับปรุง/).fill(title);
    await page.getByLabel('ระดับประโยชน์').selectOption('HIGH');
    await page.getByRole('button', { name: 'เสนอรายการ' }).click();
    await expect(page).toHaveURL(/\/improvement\/IMP-\d{4}$/);
    no = page.url().split('/').pop()!;
    await expect(page.locator('li[aria-current="step"]')).toContainText('วิสัยทัศน์คืออะไร');
    await expect(page.getByText(/เสนอรายการปรับปรุง “E2E/)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: /Continual Improvement/ })).toContainText('4');
  });

  test('ประตูตรวจ: ไปขั้นถัดไปไม่ได้ถ้ายังไม่มีวิสัยทัศน์ → ใส่แล้วไปได้ (ขั้นที่เลือกได้มีแค่ถัดไปและย้อนกลับ)', async ({ page }) => {
    await page.goto(`/improvement/${no}`);
    // เก็บฟิลด์ของฟอร์ม "เปลี่ยนขั้น" ไว้ใช้ในเคสปลอม request (ก่อน hydrate เหมือน 07-permissions)
    fields = await page.evaluate(() => {
      const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('input[name=note]'))!;
      return Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((i) => [i.name, i.value]));
    });
    expect(Object.keys(fields).length, 'ต้องมีฟิลด์ $ACTION_* ของฟอร์ม').toBeGreaterThan(0);
    await waitHydrated(page);
    await page.getByRole('button', { name: 'เปลี่ยนขั้น', exact: true }).click();
    await expect(alert(page)).toContainText('ขั้นที่ 1: ต้องระบุวิสัยทัศน์');

    await waitHydrated(page);
    await page.getByLabel(/^วิสัยทัศน์/).fill('ลดการส่งต่อซ้ำระหว่างทีม');
    await save(page, 'บันทึกการแก้ไข');
    await expect(page.getByLabel(/^วิสัยทัศน์/)).toHaveValue('ลดการส่งต่อซ้ำระหว่างทีม');
    await waitHydrated(page);
    const options = await page.getByLabel('ไปยังขั้น').locator('option').allTextContents();
    expect(options).toEqual(['2. ตอนนี้เราอยู่ที่ไหน']); // ที่ขั้น 1 มีแค่ถัดไป (ข้ามขั้นไม่ได้)
    await page.getByRole('button', { name: 'เปลี่ยนขั้น', exact: true }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('ตอนนี้เราอยู่ที่ไหน');
  });

  test('Server Action ปลอม: สมาชิก CAB POST ฟอร์มเปลี่ยนขั้นของเจ้าหน้าที่ → ไม่มีผล (เคสควบคุม: เจ้าหน้าที่ POST แล้วสำเร็จ)', async ({ browser }) => {
    // ตอนนี้อยู่ขั้น 2 แต่ยังไม่มีค่าฐาน → ปลอมไปขั้น 3 ต้องถูกประตูตรวจปฏิเสธแม้ผู้เรียกมีสิทธิ์ จึงใช้ย้อนกลับขั้น 1 เป็นการเปลี่ยนที่ทำได้จริง
    const multipart = { ...fields, to: '1', note: 'ปลอม' };
    const cab = await asRole(browser, 'cab');
    await cab.page.request.post(`/improvement/${no}`, { multipart, maxRedirects: 0, failOnStatusCode: false });
    await cab.page.goto(`/improvement/${no}`);
    await expect(cab.page.locator('li[aria-current="step"]')).toContainText('ตอนนี้เราอยู่ที่ไหน'); // ยังอยู่ขั้น 2
    await cab.context.close();

    const agent = await asRole(browser, 'agent');
    const res = await agent.page.request.post(`/improvement/${no}`, { multipart, maxRedirects: 0, failOnStatusCode: false });
    expect(res.status(), 'ฟอร์มที่ปลอมต้องใช้งานได้เมื่อผู้เรียกมีสิทธิ์').toBe(303);
    await agent.page.goto(`/improvement/${no}`);
    await expect(agent.page.locator('li[aria-current="step"]')).toContainText('วิสัยทัศน์คืออะไร'); // ย้อนกลับขั้น 1
    // กลับมาขั้น 2 เพื่อทำเคสถัดไป
    await waitHydrated(agent.page);
    await agent.page.getByRole('button', { name: 'เปลี่ยนขั้น', exact: true }).click();
    await expect(agent.page.locator('li[aria-current="step"]')).toContainText('ตอนนี้เราอยู่ที่ไหน');
    await agent.context.close();
  });

  test('ขั้น 2→3 ต้องมีค่าฐาน, 3→4 ต้องมีเป้าหมาย; จนถึงขั้น 6 ต้องมีผลที่ได้จึงปิดได้', async ({ page }) => {
    await page.goto(`/improvement/${no}`);
    await waitHydrated(page);
    await page.getByRole('button', { name: 'เปลี่ยนขั้น', exact: true }).click();
    await expect(alert(page)).toContainText('ค่าฐาน');

    await waitHydrated(page);
    await page.getByLabel(/^สถานะปัจจุบัน/).fill('ส่งต่อเฉลี่ย 3.2 ครั้ง/เรื่อง');
    await save(page, 'บันทึกการแก้ไข');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'เปลี่ยนขั้น', exact: true }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('อยากไปถึงไหน');

    await waitHydrated(page);
    await page.getByRole('button', { name: 'เปลี่ยนขั้น', exact: true }).click();
    await expect(alert(page)).toContainText('เป้าหมายที่วัดได้');

    await waitHydrated(page);
    await page.getByLabel(/^เป้าหมายที่วัดได้/).fill('ส่งต่อเฉลี่ยไม่เกิน 2 ครั้ง/เรื่อง');
    await save(page, 'บันทึกการแก้ไข');
    for (const step of ['ไปถึงได้อย่างไร', 'ลงมือทำ', 'ไปถึงหรือยัง']) {
      await waitHydrated(page);
      await page.getByRole('button', { name: 'เปลี่ยนขั้น', exact: true }).click();
      await expect(page.locator('li[aria-current="step"]')).toContainText(step);
    }

    // ขั้น 6: ปิดไม่ได้ถ้ายังไม่มีผล และออกไปขั้น 7 ไม่ได้
    await waitHydrated(page);
    await page.getByLabel('เปลี่ยนเป็น').selectOption('DONE');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(alert(page)).toContainText('ต้องบันทึกผลที่ได้จริงก่อนปิด');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'เปลี่ยนขั้น', exact: true }).click();
    await expect(alert(page)).toContainText('ขั้นที่ 6: ต้องบันทึกผลที่ได้จริง');
  });

  test('พักไว้ต้องมีเหตุผล → รายการที่พักไม่ขึ้นแดชบอร์ดและเปลี่ยนขั้นไม่ได้ → กลับมาดำเนินการต่อ', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(title)).toBeVisible(); // กำลังดำเนินการ = ขึ้นแดชบอร์ด

    await page.goto(`/improvement/${no}`);
    await waitHydrated(page);
    await page.getByLabel('เปลี่ยนเป็น').selectOption('ON_HOLD');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(alert(page)).toContainText('ต้องระบุเหตุผล');

    await waitHydrated(page);
    await page.getByLabel('เปลี่ยนเป็น').selectOption('ON_HOLD');
    await page.getByLabel(/^เหตุผล/).fill('รอผลสำรวจจากทีม Network');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByText('พักไว้').first()).toBeVisible();
    await expect(page.getByText(/รอผลสำรวจจากทีม Network/)).toBeVisible(); // เหตุผลอยู่ในประวัติ
    await expect(page.getByRole('heading', { name: 'เปลี่ยนขั้นตอน' })).toHaveCount(0);

    await page.goto('/');
    await expect(page.getByText(title)).toHaveCount(0);

    await page.goto(`/improvement/${no}`);
    await waitHydrated(page);
    await page.getByLabel('เปลี่ยนเป็น').selectOption('OPEN');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByRole('heading', { name: 'เปลี่ยนขั้นตอน' })).toBeVisible();
  });

  test('บันทึกผลแล้วปิดเป็น "บรรลุแล้ว" → เข้าขั้น 7 แก้ไขไม่ได้ → เปิดใหม่กลับมาขั้น 6', async ({ page }) => {
    await page.goto(`/improvement/${no}`);
    await waitHydrated(page);
    await page.getByLabel(/^ผลที่ได้จริง/).fill('ส่งต่อเฉลี่ย 1.8 ครั้ง/เรื่อง (ถึงเป้า)');
    await save(page, 'บันทึกการแก้ไข');
    await waitHydrated(page);
    await page.getByLabel('เปลี่ยนเป็น').selectOption('DONE');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'ปิดแล้ว' })).toBeVisible();
    await expect(page.getByLabel(/หัวข้อการปรับปรุง/)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toHaveCount(0);
    await expect(page.locator('li[aria-current="step"]')).toHaveCount(0); // ทุกขั้นเสร็จแล้ว
    await expect(page.getByText('รักษาแรงส่งอย่างไร').first()).toBeVisible();

    await waitHydrated(page);
    await page.getByLabel('เปลี่ยนเป็น').selectOption('OPEN');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('ไปถึงหรือยัง');
  });

  test('ยกเลิกต้องมีเหตุผล และยกเลิกแล้วจบ (ไม่มีทางเปลี่ยนสถานะอีก)', async ({ page }) => {
    await page.goto(`/improvement/${no}`);
    await waitHydrated(page);
    await page.getByLabel('เปลี่ยนเป็น').selectOption('CANCELLED');
    await page.getByLabel(/^เหตุผล/).fill('องค์กรเปลี่ยนลำดับความสำคัญ');
    await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'ปิดแล้ว' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เปลี่ยนสถานะ' })).toHaveCount(0);
    await page.goto('/improvement?status=CANCELLED');
    await expect(rowOf(page, no)).toContainText('ยกเลิก');
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: /Continual Improvement/ })).toContainText('3');
  });
});
