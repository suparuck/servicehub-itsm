import { expect, test, type Page } from '@playwright/test';
import { alert, asRole, authFile, waitHydrated } from './helpers';

const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
const tile = (page: Page, label: string) => page.getByTestId('tiles').getByRole('link', { name: new RegExp(`^${label}`) });
const step = (page: Page) => page.locator('li[aria-current="step"]');
const pkg = (page: Page) => page.getByTestId('package');
/** กดบันทึกแล้วรอทั้งการตอบกลับของ action และการรีเรนเดอร์ — ไม่งั้นช่องที่เลือกต่อทันทีอาจถูกรีเซ็ตกลับค่าเริ่มต้น (React 19 ล้างฟอร์มหลัง action) */
async function save(page: Page, name: string) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name }).click()]);
  await page.waitForLoadState('networkidle');
}
/** เลือก Change ในรายการ "เพิ่ม Change" ตามเลขที่ (ค่าของตัวเลือกคือเลขที่เอกสาร) แล้วกดเพิ่ม */
async function addChange(page: Page, docNo: string) {
  const select = page.getByLabel(/^เพิ่ม Change/);
  await select.selectOption((await select.locator('option', { hasText: docNo }).getAttribute('value'))!);
  await page.getByRole('button', { name: 'เพิ่มเข้าแพ็กเกจ' }).click();
}
async function move(page: Page, to: string, reason?: string) {
  await waitHydrated(page);
  await page.getByLabel('เปลี่ยนเป็น').selectOption({ label: to });
  if (reason !== undefined) await page.getByLabel(/^เหตุผล/).fill(reason);
  await page.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
}

test.describe('Release Management: ดูข้อมูล (สมาชิก CAB — ไม่มีสิทธิ์จัดการ)', () => {
  test.use({ storageState: authFile('cab') });

  test('สรุปตัวเลข รายการ และตัวกรองตามข้อมูลตัวอย่าง', async ({ page }) => {
    await page.goto('/releases');
    await expect(page.getByRole('heading', { level: 1, name: 'Release Management' })).toBeVisible();
    await expect(tile(page, 'วางแผน/จัดเตรียม')).toContainText('2');
    await expect(tile(page, 'เปิดใช้แล้ว')).toContainText('1');
    await expect(page.getByText('พบ 2 รายการ')).toBeVisible(); // เริ่มต้น = ที่ยังไม่จบ
    await expect(rowOf(page, 'REL-0007')).toContainText('กำลังจัดเตรียม');
    await expect(rowOf(page, 'REL-0006')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '+ สร้าง Release' })).toHaveCount(0);
    await tile(page, 'เปิดใช้แล้ว').click();
    await expect(rowOf(page, 'REL-0006')).toContainText('เปิดใช้แล้ว');
    await page.goto('/releases?status=all');
    await expect(page.getByText('พบ 3 รายการ')).toBeVisible();
  });

  test('รายละเอียด REL-0007: ผ่าน Go/No-Go ครบ มีแพ็กเกจ 2 Change แต่แก้ไขไม่ได้', async ({ page }) => {
    await page.goto('/releases/REL-0007');
    await expect(page.getByRole('heading', { level: 1, name: /เครือข่ายและ M365/ })).toBeVisible();
    await expect(step(page)).toContainText('กำลังจัดเตรียม');
    const go = page.getByTestId('go-list');
    await expect(go.getByRole('listitem')).toHaveCount(6);
    await expect(go.getByText('ผ่าน', { exact: true })).toHaveCount(6);
    await expect(pkg(page).getByRole('listitem')).toHaveCount(2);
    await expect(pkg(page).getByRole('link', { name: 'CHG-3376' })).toBeVisible();
    await expect(page.getByLabel(/^ชื่อ Release/)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เปลี่ยนสถานะ' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^ถอดออก/ })).toHaveCount(0);
  });

  test('REL-0008 (ยังไม่มี Change/แผน) ไม่ผ่าน Go/No-Go; REL-0006 มีบันทึกทบทวนแต่แก้ไม่ได้; หน้าสร้างเข้าไม่ได้', async ({ page }) => {
    await page.goto('/releases/REL-0008');
    await expect(page.getByTestId('go-list').getByText('ไม่ผ่าน', { exact: true })).toHaveCount(5); // เหลือแค่ "เจ้าของ" ที่ผ่าน
    await expect(page.getByText('ยังไม่ผ่านบางข้อ')).toBeVisible();
    await page.goto('/releases/REL-0006');
    await expect(page.getByTestId('go-list')).toHaveCount(0); // จบแล้วไม่ต้องแสดงเกณฑ์
    await expect(page.getByLabel(/^ทบทวนหลังเปิดใช้งาน/)).toHaveValue(/ผู้ใช้รายงานการหลุดของ VPN ลดลง/);
    await expect(page.getByLabel(/^ทบทวนหลังเปิดใช้งาน/)).toBeDisabled();
    await expect(pkg(page).getByRole('link', { name: 'CHG-3350' })).toBeVisible();
    expect((await page.goto('/releases/new'))?.status()).toBe(404);
    expect((await page.goto('/releases/REL-9999'))?.status()).toBe(404);
    expect((await page.goto('/releases/abc'))?.status()).toBe(404);
  });

  test('หน้ารายละเอียด Change แสดงว่าอยู่ใน Release ใดและลิงก์ไปได้', async ({ page }) => {
    await page.goto('/changes/CHG-3376');
    await page.getByRole('link', { name: /REL-0007/ }).click();
    await expect(page).toHaveURL(/\/releases\/REL-0007$/);
  });
});

test.describe.serial('Release Management: วงจร Release (Change Manager)', () => {
  test.use({ storageState: authFile('changeManager') });
  let moveFields: Record<string, string> = {};
  let mine = ''; // เลขที่ Release ที่สร้างในเทสต์
  const name = 'E2E Release 2026.12';

  test('สร้าง Release: ช่วงเวลาผิดถูกปฏิเสธ แล้วสร้างสำเร็จเริ่มที่ "วางแผน"', async ({ page }) => {
    await page.goto('/releases');
    await page.getByRole('link', { name: '+ สร้าง Release' }).click();
    await waitHydrated(page);
    await page.getByLabel(/^ชื่อ Release/).fill(name);
    await page.getByLabel(/^เริ่มเปิดใช้/).fill('2030-01-10T22:00');
    await page.getByLabel(/^สิ้นสุด/).fill('2030-01-10T21:00');
    await page.getByRole('button', { name: 'สร้าง Release' }).click();
    await expect(alert(page)).toContainText('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
    // ส่งแล้ว error → หน้าโหลดใหม่ (ฟอร์มว่าง เหมือนฟอร์มอื่นที่ใช้ redirect) กรอกใหม่ทั้งหมด
    await waitHydrated(page);
    await page.getByLabel(/^ชื่อ Release/).fill(name);
    await page.getByLabel(/^เริ่มเปิดใช้/).fill('2030-01-10T22:00');
    await page.getByLabel(/^สิ้นสุด/).fill('2030-01-11T00:00');
    await page.getByRole('button', { name: 'สร้าง Release' }).click();
    await expect(page).toHaveURL(/\/releases\/REL-\d{4}$/);
    mine = page.url().split('/').pop()!;
    await expect(step(page)).toContainText('วางแผน');
    await expect(page.getByText(/สร้าง Release “E2E Release 2026.12”/)).toBeVisible();
  });

  test('แพ็กเกจ: ถอด CHG-3370 จาก REL-0007 → ใส่ Release ชั่วคราวแล้วยกเลิก → Change กลับมาเลือกได้ → ใส่ใน Release ของเรา', async ({ page }) => {
    await page.goto('/releases/REL-0007');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'ถอดออก CHG-3370' }).click();
    await expect(pkg(page).getByRole('listitem')).toHaveCount(1);

    // Release ชั่วคราว → เพิ่ม Change → ยกเลิก (ต้องปล่อย Change ออกจากแพ็กเกจ)
    await page.goto('/releases/new');
    await waitHydrated(page);
    await page.getByLabel(/^ชื่อ Release/).fill('E2E ชั่วคราว');
    await page.getByRole('button', { name: 'สร้าง Release' }).click();
    await expect(page).toHaveURL(/\/releases\/REL-\d{4}$/);
    const temp = page.url().split('/').pop()!;
    await waitHydrated(page);
    await addChange(page, 'CHG-3370');
    await expect(pkg(page).getByRole('link', { name: 'CHG-3370' })).toBeVisible();
    await page.goto(`/releases/${mine}`);
    await expect(page.getByLabel(/^เพิ่ม Change/).locator('option', { hasText: 'CHG-3370' })).toHaveCount(0); // อยู่ใน Release อื่นแล้ว เลือกซ้ำไม่ได้

    await page.goto(`/releases/${temp}`);
    await move(page, 'ยกเลิก', 'สร้างผิด');
    await expect(page.getByTestId('go-list')).toHaveCount(0); // จบแล้ว ไม่ต้องแสดงเกณฑ์
    await expect(page.getByText(/ปล่อย Change ออกจากแพ็กเกจแล้ว/)).toBeVisible();
    await expect(pkg(page).getByRole('listitem')).toHaveCount(0); // ปล่อย Change ออกแล้ว

    await page.goto(`/releases/${mine}`);
    await waitHydrated(page);
    await addChange(page, 'CHG-3370');
    await expect(pkg(page).getByRole('link', { name: 'CHG-3370' })).toBeVisible();
  });

  test('Go/No-Go: เปลี่ยนเป็นพร้อมเปิดใช้ไม่ได้จนกว่าจะครบ (เจ้าของ แผน) แล้วผ่านเมื่อครบ และแพ็กเกจถูกล็อก', async ({ page }) => {
    await page.goto(`/releases/${mine}`);
    await move(page, 'กำลังจัดเตรียม');
    await expect(step(page)).toContainText('กำลังจัดเตรียม');
    await move(page, 'พร้อมเปิดใช้');
    await expect(alert(page)).toContainText('ยังไม่ผ่านเกณฑ์ Go/No-Go');
    await expect(alert(page)).toContainText('ระบุเจ้าของ Release');
    await expect(alert(page)).toContainText('แผนการเปิดใช้');
    await expect(alert(page)).toContainText('แผนถอยกลับ');

    await waitHydrated(page);
    await page.getByLabel(/^เจ้าของ Release/).selectOption({ label: 'กมลา วงศ์ไทย' });
    await page.getByLabel(/^แผนการเปิดใช้/).fill('ติดตั้งตามลำดับ');
    await page.getByLabel(/^แผนถอยกลับ/).fill('คืนค่าเดิม');
    await save(page, 'บันทึกการแก้ไข');
    await expect(page.getByTestId('go-list').getByText('ไม่ผ่าน', { exact: true })).toHaveCount(0);
    await move(page, 'พร้อมเปิดใช้');
    await expect(step(page)).toContainText('พร้อมเปิดใช้');
    // แพ็กเกจถูกล็อกหลังตัดสิน Go
    await expect(page.getByRole('button', { name: /^ถอดออก/ })).toHaveCount(0);
    await expect(page.getByText('แก้ไขแพ็กเกจไม่ได้ในสถานะนี้')).toBeVisible();
    // ย้อนกลับต้องมีเหตุผล
    await move(page, 'กำลังจัดเตรียม', '');
    await expect(alert(page)).toContainText('ต้องระบุเหตุผล');
    await move(page, 'กำลังจัดเตรียม', 'ขอเพิ่มการทดสอบ');
    await expect(step(page)).toContainText('กำลังจัดเตรียม');
    await expect(page.getByRole('button', { name: 'ถอดออก CHG-3370' })).toBeVisible(); // แก้แพ็กเกจได้อีกครั้ง
    await move(page, 'พร้อมเปิดใช้');
    await expect(step(page)).toContainText('พร้อมเปิดใช้');
  });

  test('เปิดใช้: เริ่มเปิดใช้ได้ แต่ "เปิดใช้แล้ว" ไม่ได้ถ้า Change ยังไม่เสร็จสิ้น → เสร็จแล้วผ่าน → บันทึกทบทวนได้', async ({ page, browser }) => {
    await page.goto(`/releases/${mine}`);
    await move(page, 'กำลังเปิดใช้');
    await expect(step(page)).toContainText('กำลังเปิดใช้');
    await move(page, 'เปิดใช้แล้ว');
    await expect(alert(page)).toContainText('ยังมี Change ที่ไม่เสร็จสิ้น: CHG-3370');

    // ดำเนินการ Change ให้เสร็จสิ้นตามกระบวนการของ Change Enablement
    const cm = await asRole(browser, 'changeManager');
    await cm.page.goto('/changes/CHG-3370');
    await waitHydrated(cm.page);
    await cm.page.getByRole('button', { name: 'เริ่มดำเนินการ' }).click();
    await expect(step(cm.page)).toContainText('5. ดำเนินการ');
    await waitHydrated(cm.page);
    await cm.page.getByLabel('ผลลัพธ์ / บันทึกการดำเนินการ').fill('เพิ่มผู้ใช้เรียบร้อย');
    await cm.page.getByRole('button', { name: 'ดำเนินการสำเร็จ' }).click();
    await expect(step(cm.page)).toContainText('6. เสร็จสิ้น');
    await cm.context.close();

    await page.goto(`/releases/${mine}`);
    await move(page, 'เปิดใช้แล้ว');
    await expect(step(page)).toContainText('เปิดใช้แล้ว'); // ขั้นสุดท้ายเป็นขั้นปัจจุบัน ขั้นก่อนหน้าเป็น ✓
    await expect(page.getByText('✓').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'เปลี่ยนสถานะ' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^ถอดออก/ })).toHaveCount(0);

    await waitHydrated(page);
    await page.getByLabel(/^ทบทวนหลังเปิดใช้งาน/).fill('เปิดใช้ราบรื่น ควรแจ้งผู้ใช้ล่วงหน้ามากขึ้น');
    await save(page, 'บันทึกการทบทวน');
    await expect(page.getByLabel(/^ทบทวนหลังเปิดใช้งาน/)).toHaveValue('เปิดใช้ราบรื่น ควรแจ้งผู้ใช้ล่วงหน้ามากขึ้น');
    await expect(page.getByText(/บันทึกการทบทวนหลังเปิดใช้งาน/)).toBeVisible();
  });

  test('Server Action ปลอม: เจ้าหน้าที่ทั่วไป POST ฟอร์มเปลี่ยนสถานะของ REL-0007 → ไม่มีผล (เคสควบคุม: ผู้จัดการ POST แล้วสำเร็จ)', async ({ browser }) => {
    const mgr = await asRole(browser, 'changeManager');
    await mgr.page.goto('/releases/REL-0007');
    // เก็บฟิลด์ของฟอร์มเปลี่ยนสถานะ (ก่อน hydrate เหมือน 07-permissions)
    moveFields = await mgr.page.evaluate(() => {
      const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('select[name=to]'))!;
      return Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((i) => [i.name, i.value]));
    });
    expect(Object.keys(moveFields).length, 'ต้องมีฟิลด์ $ACTION_* ของฟอร์ม').toBeGreaterThan(0);
    const multipart = { ...moveFields, to: 'READY', reason: '' };

    const agent = await asRole(browser, 'agent');
    await agent.page.request.post('/releases/REL-0007', { multipart, maxRedirects: 0, failOnStatusCode: false });
    await agent.page.goto('/releases/REL-0007');
    await expect(step(agent.page)).toContainText('กำลังจัดเตรียม');
    await agent.context.close();

    // REL-0007 ถูกถอด CHG-3370 ไปแล้ว เหลือ CHG-3376 อนุมัติแล้ว + แผนครบ → ผ่าน Go/No-Go
    const res = await mgr.page.request.post('/releases/REL-0007', { multipart, maxRedirects: 0, failOnStatusCode: false });
    expect(res.status(), 'ฟอร์มที่ปลอมต้องใช้งานได้เมื่อผู้เรียกมีสิทธิ์').toBe(303);
    await mgr.page.goto('/releases/REL-0007');
    await expect(step(mgr.page)).toContainText('พร้อมเปิดใช้');
    await mgr.context.close();
  });

  test('ถอยกลับ: ต้องระบุเหตุผล → สถานะ "ถอยกลับแล้ว" บันทึกทบทวนได้ และ Change ยังอยู่ในแพ็กเกจเป็นประวัติ', async ({ page }) => {
    await page.goto('/releases/REL-0007');
    await move(page, 'กำลังเปิดใช้');
    await expect(step(page)).toContainText('กำลังเปิดใช้');
    await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toHaveCount(0); // เริ่มเปิดใช้แล้วแก้แผนไม่ได้
    await move(page, 'ถอยกลับแล้ว', '');
    await expect(alert(page)).toContainText('ต้องระบุเหตุผล');
    await move(page, 'ถอยกลับแล้ว', 'พบข้อผิดพลาดหลังอัปเกรดสาขาแรก');
    await expect(page.getByRole('status').filter({ hasText: 'ถอยกลับแล้ว' })).toBeVisible();
    await expect(page.getByText(/พบข้อผิดพลาดหลังอัปเกรดสาขาแรก/)).toBeVisible();
    await expect(pkg(page).getByRole('link', { name: 'CHG-3376' })).toBeVisible();
    await expect(page.getByLabel(/^ทบทวนหลังเปิดใช้งาน/)).toBeVisible();
    await page.goto('/releases?status=ROLLED_BACK');
    await expect(rowOf(page, 'REL-0007')).toContainText('ถอยกลับแล้ว');
  });
});
