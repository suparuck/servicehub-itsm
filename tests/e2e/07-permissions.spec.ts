import { expect, test } from '@playwright/test';
import { asRole, waitHydrated } from './helpers';

test.describe('สิทธิ์ตามบทบาท', () => {
  test('สมาชิก CAB ดู Problem ได้แต่แก้ไม่ได้ และสร้างไม่ได้', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'cab');
    await page.goto('/problems/PRB-0412');
    await expect(page.getByRole('status').filter({ hasText: 'ดูได้อย่างเดียว' })).toBeVisible();
    await expect(page.locator('select[name="phase"]')).toHaveCount(0);
    await expect(page.locator('fieldset[disabled]')).toHaveCount(1);
    expect((await page.goto('/problems/new'))?.status()).toBe(404);
    expect((await page.goto('/changes/new'))?.status()).toBe(404);
    await context.close();
  });

  test('เจ้าหน้าที่สร้างบทความร่างได้ แต่เผยแพร่ไม่ได้ — หัวหน้ากลุ่มเผยแพร่ได้และผู้ใช้ค้นเจอ', async ({ browser }) => {
    const agent = await asRole(browser, 'agent');
    await agent.page.goto('/knowledge/new');
    await waitHydrated(agent.page);
    await agent.page.getByLabel(/หัวข้อบทความ/).fill('E2E: รีเซ็ตรหัสผ่าน Windows ด้วยตนเอง');
    await agent.page.getByLabel(/เนื้อหา/).fill('1. กด “ลืมรหัสผ่าน”\n2. ยืนยันด้วย MFA');
    await agent.page.getByRole('button', { name: 'บันทึกเป็นร่าง' }).click();
    await expect(agent.page).toHaveURL(/\/knowledge\/KB-\d+$/);
    const kbUrl = agent.page.url();
    await expect(agent.page.getByRole('button', { name: 'เผยแพร่ในพอร์ทัล' })).toBeDisabled();
    await expect(agent.page.getByText('เฉพาะหัวหน้ากลุ่มผู้แก้ไขหรือผู้ดูแลระบบที่เผยแพร่ได้')).toBeVisible();

    const user = await asRole(browser, 'endUser');
    await user.page.goto('/portal/search?q=' + encodeURIComponent('รีเซ็ตรหัสผ่าน'));
    await expect(user.page.getByText('E2E: รีเซ็ตรหัสผ่าน Windows')).toHaveCount(0); // ร่างยังไม่เห็น

    const lead = await asRole(browser, 'lead');
    await lead.page.goto(kbUrl);
    await waitHydrated(lead.page);
    await lead.page.getByRole('button', { name: 'เผยแพร่ในพอร์ทัล' }).click();
    await expect(lead.page.getByText('เผยแพร่แล้ว').first()).toBeVisible();

    await user.page.reload();
    await expect(user.page.getByText('E2E: รีเซ็ตรหัสผ่าน Windows')).toBeVisible();
    await Promise.all([agent.context.close(), user.context.close(), lead.context.close()]);
  });

  test('Problem: เปลี่ยนระยะตามลำดับได้ แต่ปิดไม่ได้ถ้ายังมี Change ที่ผูกอยู่และยังไม่เสร็จ', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'agent');
    await page.goto('/problems/PRB-0401');
    await waitHydrated(page);
    // ระยะ "ควบคุมข้อผิดพลาด" ที่มี Workaround อยู่แล้ว → เป็น Known Error ได้
    await page.locator('select[name="phase"]').selectOption('KNOWN_ERROR');
    await page.getByRole('button', { name: 'เปลี่ยนระยะ' }).click();
    await expect(page.locator('li[aria-current="step"]')).toContainText('Known Error');
    await expect(page.getByText('เปลี่ยนระยะ: ควบคุมข้อผิดพลาด → Known Error')).toBeVisible();
    await waitHydrated(page);
    await page.locator('select[name="phase"]').selectOption('RESOLVED');
    await page.getByRole('button', { name: 'เปลี่ยนระยะ' }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText('Change ที่ผูกอยู่');
    await context.close();
  });

  test('ผู้ดูแลระบบเห็นปุ่มของทุกบทบาท', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'admin');
    await page.goto('/knowledge/KB-1187');
    await expect(page.getByRole('button', { name: 'ยกเลิกการเผยแพร่' })).toBeEnabled();
    await page.goto('/changes/new');
    await expect(page.getByRole('heading', { level: 1, name: 'สร้าง Change' })).toBeVisible();
    await context.close();
  });
});

test.describe('CMDB: สิทธิ์แก้ไข', () => {
  test('สมาชิก CAB ดู CMDB ได้ แต่ไม่เห็นปุ่มเพิ่ม/แก้ไข/ยืนยัน และเข้าหน้าแก้ไขไม่ได้', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'cab');
    await page.goto('/cmdb');
    await expect(page.getByRole('link', { name: '+ เพิ่ม CI' })).toHaveCount(0);
    await page.goto('/cmdb/CI-DB-00217');
    await expect(page.getByRole('heading', { name: 'ERP-DB-02', level: 2 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'แก้ไข', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'ยืนยันข้อมูลแล้ว' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เพิ่มความสัมพันธ์' })).toHaveCount(0);
    expect((await page.goto('/cmdb/new'))?.status()).toBe(404);
    expect((await page.goto('/cmdb/CI-DB-00217/edit'))?.status()).toBe(404);
    await context.close();
  });
});

test.describe.serial('Server Action ปลอม request: ผู้ใช้ปลายทางเรียก action ของเจ้าหน้าที่ไม่ได้', () => {
  // Server Action เรียกได้ด้วย action ID จากหน้าไหนก็ได้ (middleware กั้นแค่ URL)
  // จึงดึงฟิลด์ที่ซ่อนของฟอร์ม "ยกระดับ" จากหน้าเจ้าหน้าที่ แล้ว POST ซ้ำด้วย session ของผู้ใช้ปลายทาง
  let fields: Record<string, string> = {};
  const incident = 'INC-24809';

  test('เตรียม: ดึงฟิลด์ของฟอร์มยกระดับ', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'agent');
    await page.goto(`/incidents/${incident}`);
    fields = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.includes('ยกระดับ'));
      const form = btn!.closest('form')!;
      return Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((i) => [i.name, i.value]));
    });
    expect(Object.keys(fields).length, 'ต้องมีฟิลด์ $ACTION_* ของฟอร์ม').toBeGreaterThan(0);
    await context.close();
  });

  test('ผู้ใช้ปลายทาง POST ฟอร์มปลอม → ไม่มีผล', async ({ browser }) => {
    const user = await asRole(browser, 'endUser');
    await user.page.request.post('/portal', { multipart: fields, maxRedirects: 0, failOnStatusCode: false });
    await user.context.close();

    const agent = await asRole(browser, 'agent');
    await agent.page.goto(`/incidents/${incident}`);
    await expect(agent.page.getByRole('button', { name: 'ยกระดับ (Escalate)' })).toBeVisible(); // ยังไม่ถูกยกระดับ
    await expect(agent.page.getByText('Major Incident')).toHaveCount(0);
    await agent.context.close();
  });

  test('เคสควบคุม: เจ้าหน้าที่ POST ฟอร์มเดียวกันแล้วสำเร็จ (พิสูจน์ว่า request ปลอมใช้งานได้จริง)', async ({ browser }) => {
    const agent = await asRole(browser, 'agent');
    const res = await agent.page.request.post(`/incidents/${incident}`, { multipart: fields, maxRedirects: 0, failOnStatusCode: false });
    expect(res.status(), 'Server Action ที่ปลอมขึ้นต้องทำงานได้เมื่อผู้เรียกมีสิทธิ์').toBe(303);
    await agent.page.goto(`/incidents/${incident}`);
    await expect(agent.page.getByText('Major Incident').first()).toBeVisible();
    await agent.context.close();
  });
});
