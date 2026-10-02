import { expect, test } from '@playwright/test';
import { alert, authFile, waitHydrated } from './helpers';

test.use({ storageState: authFile('agent') });

test.describe.serial('Incident', () => {
  const title = `E2E: ERP ปิดงวดไม่ได้ ${Date.now()}`;
  let docNo = '';

  test('รายการ: ค้นหา กรองตาม priority และแบ่งหน้า', async ({ page }) => {
    await page.goto('/incidents');
    await expect(page.getByText('พบ 42 รายการ')).toBeVisible();
    await page.getByLabel('ลำดับความสำคัญ').selectOption('P1');
    await page.getByRole('button', { name: 'ค้นหา' }).click();
    await expect(page.getByText('พบ 2 รายการ')).toBeVisible();
    await page.goto('/incidents?q=24817&status=all');
    await expect(page.getByText('พบ 1 รายการ')).toBeVisible();
    await page.goto('/incidents');
    await expect(page.getByText(/หน้า 1 จาก 3/)).toBeVisible();
  });

  test('สร้าง Incident: priority คำนวณสดตามเมทริกซ์ แล้วได้ P1 พร้อม SLA', async ({ page }) => {
    await page.goto('/incidents/new');
    await waitHydrated(page);
    await expect(page.getByText('P3 ปานกลาง')).toBeVisible(); // MED × MED
    await page.getByLabel(/หัวข้อเหตุขัดข้อง/).fill(title);
    await page.getByLabel('ผลกระทบ (Impact)').selectOption('HIGH');
    await page.getByLabel('ความเร่งด่วน (Urgency)').selectOption('HIGH');
    await expect(page.getByText('P1 วิกฤต')).toBeVisible();
    await page.getByLabel('บริการที่ได้รับผลกระทบ').selectOption({ label: 'ERP' });
    await page.getByRole('button', { name: 'บันทึกเหตุขัดข้อง' }).click();
    await expect(page).toHaveURL(/\/incidents\/INC-\d+$/);
    docNo = page.url().split('/').pop()!;
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('P1 วิกฤต').first()).toBeVisible();
    await expect(page.getByText('ตอบสนองครั้งแรก')).toBeVisible();
    await expect(page.getByText('แก้ไข / กู้คืนบริการ')).toBeVisible();
    await expect(page.locator('li[aria-current="step"]')).toContainText('1. บันทึกและจัดประเภท');
  });

  test('ฟอร์มไม่ล้างค่าที่กรอกเมื่อ validation ฝั่งเซิร์ฟเวอร์ไม่ผ่าน', async ({ page }) => {
    await page.goto('/incidents/new');
    await waitHydrated(page);
    await page.getByLabel(/หัวข้อเหตุขัดข้อง/).fill('   ');
    await page.getByLabel('คำอธิบายและอาการ').fill('คำอธิบายที่ต้องไม่หาย');
    await page.getByRole('button', { name: 'บันทึกเหตุขัดข้อง' }).click();
    await expect(alert(page)).toContainText('กรุณาระบุหัวข้อ');
    await expect(page.getByLabel('คำอธิบายและอาการ')).toHaveValue('คำอธิบายที่ต้องไม่หาย');
  });

  test('บันทึก: ภายในกับแจ้งผู้ใช้ และตัวกรอง "สื่อสารผู้ใช้"', async ({ page }) => {
    await page.goto(`/incidents/${docNo}`);
    await waitHydrated(page);
    await page.getByLabel('เพิ่มบันทึก').fill('ตรวจ connection pool แล้ว เต็ม 100%');
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.getByText('ตรวจ connection pool แล้ว เต็ม 100%')).toBeVisible();

    await waitHydrated(page);
    await page.getByLabel('เพิ่มบันทึก').fill('ทีมกำลังแก้ไข จะแจ้งความคืบหน้าใน 30 นาที');
    await page.getByLabel(/แจ้งผู้ใช้/).check();
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    // รอให้บันทึกนี้ปรากฏในไทม์ไลน์จริง (ข้อความ "ผู้ใช้มองเห็น" มีใน label ของฟอร์มอยู่แล้ว ใช้เป็นสัญญาณไม่ได้)
    await expect(page.locator('span.whitespace-pre-line', { hasText: 'ทีมกำลังแก้ไข จะแจ้งความคืบหน้าใน 30 นาที' })).toBeVisible();

    await page.getByRole('link', { name: 'สื่อสารผู้ใช้' }).click();
    await expect(page.getByText('ทีมกำลังแก้ไข จะแจ้งความคืบหน้าใน 30 นาที')).toBeVisible();
    await expect(page.getByText('ตรวจ connection pool แล้ว เต็ม 100%')).toHaveCount(0);
  });

  test('สถานะ: ตอบสนองครั้งแรกนับเมื่อรับงาน, รอผู้ใช้หยุดเวลา, แก้ไขต้องมีบันทึก', async ({ page }) => {
    await page.goto(`/incidents/${docNo}`);
    await waitHydrated(page);
    await page.getByLabel('สถานะถัดไป').selectOption('IN_PROGRESS');
    await page.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('3. วินิจฉัย');
    await expect(page.getByText('บรรลุแล้ว').first()).toBeVisible(); // SLA ตอบสนอง

    await waitHydrated(page);
    await page.getByLabel('สถานะถัดไป').selectOption('PENDING_USER');
    await page.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(page.getByText('หยุดชั่วคราว')).toBeVisible();
    await expect(page.getByText('หยุดเวลาระหว่างรอผู้ใช้')).toBeVisible();

    await waitHydrated(page);
    await page.getByLabel('สถานะถัดไป').selectOption('RESOLVED');
    await page.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(alert(page)).toContainText('ต้องระบุบันทึกการแก้ไข');

    await waitHydrated(page);
    await page.getByLabel('สถานะถัดไป').selectOption('RESOLVED');
    await page.getByLabel(/บันทึก \(จำเป็น/).fill('รีสตาร์ท connection pool แล้ว ใช้งานได้ปกติ');
    await page.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('4. แก้ไขและกู้คืน');
    await expect(page.getByText('ผ่าน').first()).toBeVisible();
  });

  test('Escalate เป็น Major และสร้าง Problem จาก Incident', async ({ page }) => {
    await page.goto('/incidents/INC-24790');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'ยกระดับ (Escalate)' }).click();
    await expect(page.getByText('Major Incident').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'ยกระดับ (Escalate)' })).toHaveCount(0);
    await page.getByRole('button', { name: 'สร้าง Problem' }).click();
    await expect(page.getByRole('link', { name: /PRB-\d+/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'สร้าง Problem' })).toHaveCount(0);
  });

  test('แก้ priority แล้ว SLA ปรับตาม และบันทึกประวัติ', async ({ page }) => {
    await page.goto('/incidents/INC-24802/edit');
    await waitHydrated(page);
    await page.getByLabel('ผลกระทบ (Impact)').selectOption('HIGH');
    await page.getByLabel('ความเร่งด่วน (Urgency)').selectOption('HIGH');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page).toHaveURL(/\/incidents\/INC-24802$/);
    await expect(page.getByText('P1 วิกฤต').first()).toBeVisible();
    await expect(page.getByText(/priority P3 → P1/)).toBeVisible();
    await expect(page.getByText('เป้าหมาย 4 ชั่วโมง')).toBeVisible();
  });

  test('Incident ที่ไม่มีอยู่ → 404', async ({ page }) => {
    const res = await page.goto('/incidents/INC-99999');
    expect(res?.status()).toBe(404);
  });
});
