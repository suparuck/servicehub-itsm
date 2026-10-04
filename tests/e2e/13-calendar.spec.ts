import { expect, test, type Page } from '@playwright/test';
import { authFile, waitHydrated } from './helpers';

// วันที่ตามเวลาไทย เลื่อนจากวันนี้ — ข้อมูล seed ผูกกับ "วันนี้" จึงคำนวณเดือนเอง ไม่ผูกกับวันที่จริง
const ymdAt = (offsetDays: number) => new Date(Date.now() + 7 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const monthOf = (offsetDays: number) => ymdAt(offsetDays).slice(0, 7);
const agenda = (page: Page) => page.getByTestId('agenda').getByRole('listitem');

test.describe('ปฏิทิน Change & Problem', () => {
  test.use({ storageState: authFile('agent') });

  test('เมนูอยู่ในกลุ่ม Design & Transition และเปิดหน้าได้', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'ปฏิทิน Change & Problem' }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.getByRole('heading', { level: 1, name: 'ปฏิทิน Change & Problem' })).toBeVisible();
    await expect(page.getByRole('grid', { name: 'ปฏิทิน Change และ Problem' })).toBeVisible();
  });

  test('แสดง Change ของวันนี้ และ Problem ที่มีกำหนดแก้ไขอยู่ในรายการเดือนนั้น', async ({ page }) => {
    await page.goto(`/calendar?month=${monthOf(0)}`);
    await expect(agenda(page).filter({ hasText: 'CHG-3381' })).toContainText('Emergency Change');
    await page.goto(`/calendar?month=${monthOf(5)}`);
    const row = agenda(page).filter({ hasText: 'PRB-0412' });
    await expect(row).toContainText('กำหนดแก้ไข/ทบทวน');
    await expect(row).not.toContainText('เลยกำหนด');
  });

  test('Problem ที่เลยกำหนดแต่ยังไม่แก้ไข ถูกติดป้าย "เลยกำหนด" (มีข้อความกำกับ ไม่ใช้สีอย่างเดียว)', async ({ page }) => {
    await page.goto(`/calendar?month=${monthOf(-3)}`);
    const row = agenda(page).filter({ hasText: 'PRB-0409' });
    await expect(row).toContainText('เลยกำหนด');
    await expect(row.getByRole('link', { name: 'PRB-0409' })).toHaveAttribute('href', '/problems/PRB-0409');
  });

  test('ตัวกรอง: เฉพาะ Problem / เฉพาะ Change', async ({ page }) => {
    await page.goto(`/calendar?month=${monthOf(0)}`);
    await waitHydrated(page, 'form');
    await page.getByLabel(/Change \(ช่วงดำเนินการ\)/).uncheck();
    await page.getByRole('button', { name: 'ใช้ตัวกรอง' }).click();
    await expect(page).toHaveURL(/show=problem/);
    await expect(agenda(page).filter({ hasText: 'CHG-' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /เดือนถัดไป/ })).toHaveAttribute('href', /show=problem/); // ตัวกรองคงอยู่เมื่อเลื่อนเดือน

    await page.goto(`/calendar?month=${monthOf(0)}&show=change`);
    await expect(agenda(page).filter({ hasText: 'PRB-' })).toHaveCount(0);
    await expect(agenda(page).filter({ hasText: 'CHG-3381' })).toBeVisible();
  });

  test('Change ที่ทับช่วงเวลาและแตะ CI เดียวกันถูกติดป้าย "ชนกับ" ทั้งสองฝั่ง', async ({ page }) => {
    const when = ymdAt(2); // ตรงกับ CHG-3376 (seed: +2 วัน 01:00–03:00, FW-North-01)
    await page.goto('/changes/new');
    await waitHydrated(page);
    await page.getByLabel(/หัวข้อ Change/).fill('E2E-CAL: ทดสอบการชน');
    await page.getByLabel('เริ่ม (เวลาไทย)').fill(`${when}T01:15`);
    await page.getByLabel('สิ้นสุด (เวลาไทย)').fill(`${when}T01:45`);
    await page.getByLabel(/FW-North-01/).check();
    await page.getByRole('button', { name: 'บันทึกเป็นร่าง' }).click();
    await expect(page).toHaveURL(/\/changes\/CHG-\d+$/);
    const mine = page.url().split('/').pop()!;

    await page.goto(`/calendar?month=${when.slice(0, 7)}`);
    // เลือกแถวด้วยลิงก์เลขที่เอกสารของแถวนั้นเอง (ข้อความ "ชนกับ CHG-xxxx" ของอีกแถวมีเลขนี้ด้วย)
    const rowOf = (no: string) => agenda(page).filter({ has: page.getByRole('link', { name: no, exact: true }) });
    await expect(rowOf(mine)).toContainText('ชนกับ');
    await expect(rowOf(mine)).toContainText('CHG-3376');
    await expect(rowOf('CHG-3376')).toContainText('ชนกับ');
    await expect(rowOf('CHG-3376')).toContainText(mine);
    await expect(rowOf('CHG-3381')).not.toContainText('ชนกับ'); // งานที่ไม่ทับ ไม่ถูกติดป้าย
  });

  test('ตั้งกำหนดแก้ไขของ Problem ในหน้ารายละเอียด → ขึ้นในปฏิทินวันนั้น; ล้างค่าแล้วหายไป', async ({ page }) => {
    const target = ymdAt(20);
    await page.goto('/problems/PRB-0412');
    await waitHydrated(page);
    await page.getByLabel('กำหนดแก้ไข/ทบทวน').fill(target);
    await page.getByRole('button', { name: 'บันทึกรายละเอียด' }).click();
    await expect(page.getByLabel('กำหนดแก้ไข/ทบทวน')).toHaveValue(target);
    await expect(page.getByText(/กำหนดแก้ไข\/ทบทวน: /).first()).toBeVisible(); // บันทึกในประวัติกิจกรรม

    await page.goto(`/calendar?month=${target.slice(0, 7)}`);
    const day = Number(target.slice(8));
    await expect(agenda(page).filter({ hasText: 'PRB-0412' })).toContainText(String(day).padStart(2, '0'));

    await page.goto('/problems/PRB-0412');
    await waitHydrated(page);
    await page.getByLabel('กำหนดแก้ไข/ทบทวน').fill('');
    await page.getByRole('button', { name: 'บันทึกรายละเอียด' }).click();
    await expect(page.getByLabel('กำหนดแก้ไข/ทบทวน')).toHaveValue('');
    await page.goto(`/calendar?month=${target.slice(0, 7)}`);
    await expect(agenda(page).filter({ hasText: 'PRB-0412' })).toHaveCount(0);
  });

  test('ดาวน์โหลด .ics: ชนิดไฟล์ถูกต้อง มี Change/Problem และลิงก์กลับมายังระบบ', async ({ page }) => {
    const res = await page.request.get('/calendar/export');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/calendar');
    expect(res.headers()['content-disposition']).toContain('.ics');
    const body = await res.text();
    expect(body.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(body).toContain('SUMMARY:CHG-3381');
    expect(body).toContain('PRB-0409'); // เลยกำหนด 3 วัน อยู่ในช่วง 30 วันที่ผ่านมา
    expect(body).toMatch(/URL:https?:\/\/[^\r\n]+\/changes\/CHG-3381/);
  });
});

test.describe('สิทธิ์', () => {
  test.use({ storageState: authFile('endUser') });

  test('ผู้ใช้ปลายทางเปิดปฏิทินและดาวน์โหลด .ics ไม่ได้ (ถูกส่งกลับพอร์ทัล)', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/portal$/);
    const res = await page.request.get('/calendar/export', { maxRedirects: 0 });
    expect([307, 308, 403]).toContain(res.status());
    expect(res.headers()['content-type'] ?? '').not.toContain('text/calendar');
  });
});
