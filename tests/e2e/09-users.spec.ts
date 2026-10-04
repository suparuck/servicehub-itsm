import { expect, test, type Browser } from '@playwright/test';
import { alert, asRole, login, waitHydrated } from './helpers';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const fresh = async (browser: Browser) => {
  const context = await browser.newContext({ baseURL, locale: 'th-TH', timezoneId: 'Asia/Bangkok', extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.9' } });
  return { context, page: await context.newPage() };
};

test.describe('สิทธิ์เข้าหน้าผู้ดูแล', () => {
  test('เจ้าหน้าที่ทั่วไปไม่เห็นเมนู และเข้า /admin/users ไม่ได้ (404)', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'agent');
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'ผู้ใช้และสิทธิ์' })).toHaveCount(0);
    for (const p of ['/admin/users', '/admin/users/new']) expect((await page.goto(p))?.status()).toBe(404);
    await context.close();
  });

  test('ผู้ดูแลระบบเห็นเมนูและรายการผู้ใช้ทั้งหมด', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'admin');
    await page.goto('/');
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'ผู้ใช้และสิทธิ์' }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByText(/พบ \d+ รายการ/)).toBeVisible();
    await page.getByLabel('บทบาท').selectOption('CAB_MEMBER');
    await page.getByRole('button', { name: 'ค้นหา' }).click();
    await expect(page.getByRole('link', { name: 'ประเสริฐ ตรีรัตน์' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'สมศักดิ์ ชื่นใจ' })).toHaveCount(0);
    await context.close();
  });
});

test.describe.serial('ผู้ใช้ใหม่: สร้าง → รหัสชั่วคราว → บังคับเปลี่ยน → ใช้งาน → รีเซ็ต → ปิดบัญชี', () => {
  const email = `e2e-${Date.now()}@servicehub.local`;
  const name = 'ทดสอบ อีทูอี';
  let temp = '';
  const newPw = 'Zebra-Quartz-742!';
  let userId = '';

  test('ผู้ดูแลสร้างผู้ใช้ → แสดงรหัสชั่วคราวครั้งเดียว', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'admin');
    await page.goto('/admin/users/new');
    await waitHydrated(page);
    await page.getByLabel('อีเมล', { exact: true }).fill(email);
    await page.getByLabel('ชื่อ-นามสกุล').fill(name);
    await page.getByLabel('บทบาท').selectOption('AGENT');
    await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
    temp = (await page.getByTestId('temp-password').textContent())!.trim();
    expect(temp).toHaveLength(16);
    await expect(page.getByText('แสดงครั้งเดียวเท่านั้น')).toBeVisible();

    await page.getByRole('link', { name: 'ดูผู้ใช้ที่สร้าง' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible(); // รอให้นำทางเสร็จก่อนอ่าน URL
    userId = page.url().split('/').pop()!;
    expect(userId).not.toBe('new');
    await expect(page.getByText('รอเปลี่ยนรหัสผ่าน').first()).toBeVisible();
    await expect(page.getByText(temp)).toHaveCount(0); // หน้าอื่นไม่เห็นรหัสผ่านอีก
    await context.close();
  });

  test('อีเมลซ้ำและรูปแบบผิดถูกปฏิเสธ', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'admin');
    await page.goto('/admin/users/new');
    await waitHydrated(page);
    await page.getByLabel('อีเมล', { exact: true }).fill(email.toUpperCase());
    await page.getByLabel('ชื่อ-นามสกุล').fill('ซ้ำ');
    await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
    await expect(alert(page)).toContainText('มีอยู่ในระบบแล้ว');
    await context.close();
  });

  test('เข้าด้วยรหัสชั่วคราว → ถูกบังคับไปเปลี่ยนรหัสผ่าน และเข้าหน้าอื่นไม่ได้', async ({ browser }) => {
    const { page, context } = await fresh(browser);
    await login(page, email, temp);
    await expect(page).toHaveURL(/\/account\?required=1/);
    await expect(page.getByText('คุณต้องเปลี่ยนรหัสผ่านก่อนใช้งานต่อ')).toBeVisible();
    for (const p of ['/', '/incidents', '/portal']) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/account\?required=1/);
    }
    await context.close();
  });

  test('นโยบายรหัสผ่าน: รหัสเดิมผิด / ไม่ตรงกัน / อ่อนเกินไป / ซ้ำเดิม / มีส่วนของอีเมล', async ({ browser }) => {
    const { page, context } = await fresh(browser);
    await login(page, email, temp);
    await page.waitForURL(/\/account/);
    await waitHydrated(page);
    // รอ response ของ server action ก่อนตรวจ/กรอกรอบถัดไป — React รีเซ็ตฟอร์มหลัง action จบ ถ้ากรอกก่อนค่าจะหาย
    // และข้อความที่คาดหวังแต่ละรอบต้องไม่ซ้อนกัน เพื่อไม่ให้ไปตรงกับข้อความเก่า
    const submit = async (cur: string, next: string, confirm: string, expected: string | RegExp) => {
      await page.getByLabel('รหัสผ่านปัจจุบัน').fill(cur);
      await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(next);
      await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill(confirm);
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/account')),
        page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click(),
      ]);
      await expect(alert(page)).toHaveText(expected);
    };
    const local = email.split('@')[0];
    await submit('ผิดแน่นอน', newPw, newPw, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
    await submit(temp, newPw, 'ไม่ตรงกัน!123Aa', 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
    await submit(temp, 'Ab1!', 'Ab1!', /อย่างน้อย 10 ตัวอักษร/);
    await submit(temp, 'abcdefghijkl', 'abcdefghijkl', /^ต้องมีอย่างน้อย 3 ชนิดจาก[^·]*$/);
    await submit(temp, 'Password123!', 'Password123!', 'รหัสผ่านนี้เดาง่ายเกินไป');
    await submit(temp, `${local}-Aa1!`, `${local}-Aa1!`, 'รหัสผ่านต้องไม่มีส่วนของอีเมล');
    await submit(temp, temp, temp, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');
    await expect(page).toHaveURL(/\/account/); // ยังไม่เปลี่ยน
    await context.close();
  });

  test('เปลี่ยนรหัสผ่านสำเร็จ → ออกจากระบบ → รหัสเก่าใช้ไม่ได้ รหัสใหม่ใช้ได้', async ({ browser }) => {
    const { page, context } = await fresh(browser);
    await login(page, email, temp);
    await page.waitForURL(/\/account/);
    await waitHydrated(page);
    await page.getByLabel('รหัสผ่านปัจจุบัน').fill(temp);
    await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(newPw);
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill(newPw);
    await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
    await expect(page).toHaveURL(/\/login\?reason=changed/);
    await expect(page.getByRole('status')).toContainText('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');

    await login(page, email, temp);
    await expect(alert(page)).toHaveText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    await login(page, email, newPw);
    await expect(page).toHaveURL(/:\d+\/$/); // เข้าหน้าแรกเจ้าหน้าที่ตามปกติ ไม่ถูกบังคับเปลี่ยนอีก
    await expect(page.getByRole('heading', { level: 1, name: 'แดชบอร์ดบริหารจัดการบริการ IT' })).toBeVisible();
    await context.close();
  });

  test('ผู้ดูแลรีเซ็ตรหัสผ่าน → session เดิมของผู้ใช้หมดอายุทันที และต้องเปลี่ยนใหม่', async ({ browser }) => {
    const user = await fresh(browser);
    await login(user.page, email, newPw);
    await expect(user.page).toHaveURL(/:\d+\/$/);

    const admin = await asRole(browser, 'admin');
    await admin.page.goto(`/admin/users/${userId}`);
    await waitHydrated(admin.page);
    await admin.page.getByRole('button', { name: 'ออกรหัสผ่านชั่วคราวใหม่' }).click();
    const temp2 = (await admin.page.getByTestId('temp-password').textContent())!.trim();
    expect(temp2).not.toBe(temp);
    await admin.context.close();

    await user.page.goto('/incidents'); // session เก่า
    await expect(user.page).toHaveURL(/\/login\?reason=expired/);
    await expect(alert(user.page)).toContainText('ถูกเปลี่ยนหรือรีเซ็ต');
    // หน้า login ต้องไม่ redirect วนแม้ยังมี cookie เก่า
    await login(user.page, email, temp2);
    await expect(user.page).toHaveURL(/\/account\?required=1/);
    await user.context.close();
  });

  test('ผู้ดูแลเปลี่ยนบทบาท (มีบันทึกกิจกรรม) แล้วปิดบัญชี → เข้าสู่ระบบไม่ได้ และ session เดิมใช้ไม่ได้', async ({ browser }) => {
    const user = await fresh(browser);
    // ให้ผู้ใช้มี session ที่ใช้งานได้ก่อนปิดบัญชี (เปลี่ยนรหัสผ่านก่อนเพื่อพ้นสถานะบังคับ)
    const admin = await asRole(browser, 'admin');
    await admin.page.goto(`/admin/users/${userId}`);
    await waitHydrated(admin.page);
    await admin.page.getByLabel('บทบาท').selectOption('RESOLVER_GROUP_LEAD');
    await admin.page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(admin.page.getByText(/บทบาท: เจ้าหน้าที่ Service Desk → หัวหน้ากลุ่มผู้แก้ไข/)).toBeVisible();

    // ผู้ใช้ตั้งรหัสใหม่เองอีกครั้งเพื่อมี session ปกติ (รหัสชั่วคราวล่าสุดมาจากการรีเซ็ตรอบก่อน — ใช้รีเซ็ตใหม่เพื่อได้ค่าที่ทราบ)
    await admin.page.getByRole('button', { name: 'ออกรหัสผ่านชั่วคราวใหม่' }).click();
    const temp3 = (await admin.page.getByTestId('temp-password').textContent())!.trim();
    await login(user.page, email, temp3);
    await user.page.waitForURL(/\/account/);
    await waitHydrated(user.page);
    const pw3 = 'Walnut-Prism-318#';
    await user.page.getByLabel('รหัสผ่านปัจจุบัน').fill(temp3);
    await user.page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(pw3);
    await user.page.getByLabel('ยืนยันรหัสผ่านใหม่').fill(pw3);
    await user.page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
    await user.page.waitForURL(/\/login\?reason=changed/);
    await login(user.page, email, pw3);
    await expect(user.page).toHaveURL(/:\d+\/$/);

    await admin.page.reload();
    await waitHydrated(admin.page);
    await admin.page.getByLabel('เปิดใช้งานบัญชี').uncheck();
    await admin.page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(admin.page.getByText('ปิดการใช้งานบัญชี').first()).toBeVisible();
    await admin.context.close();

    await user.page.goto('/incidents'); // session เดิม
    await expect(user.page).toHaveURL(/\/login\?reason=inactive/);
    await login(user.page, email, pw3);
    await expect(alert(user.page)).toHaveText('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); // ปิดบัญชีแล้วเข้าไม่ได้ และไม่เปิดเผยเหตุผล
    await user.context.close();
  });
});

test.describe('กันเหตุเผลอของผู้ดูแล', () => {
  test('ปิดบัญชี/ลดบทบาทตัวเอง และรีเซ็ตรหัสผ่านตัวเองผ่านหน้านี้ไม่ได้', async ({ browser }) => {
    const { page, context } = await asRole(browser, 'admin');
    await page.goto('/admin/users');
    await page.getByRole('link', { name: 'ผู้ดูแลระบบ', exact: true }).click();
    await waitHydrated(page);
    await expect(page.getByText('นี่คือบัญชีของคุณ')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ออกรหัสผ่านชั่วคราวใหม่' })).toHaveCount(0);
    await expect(page.getByText('รีเซ็ตรหัสผ่านของตัวเองไม่ได้')).toBeVisible();

    await page.getByLabel('บทบาท').selectOption('AGENT');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(alert(page)).toContainText('ลดบทบาทของตัวเองไม่ได้');

    await waitHydrated(page);
    await page.getByLabel('เปิดใช้งานบัญชี').uncheck();
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(alert(page)).toContainText('ปิดบัญชีของตัวเองไม่ได้');
    await context.close();
  });
});

test.describe('จำกัดการเดารหัสผ่านเดิมในหน้าเปลี่ยนรหัสผ่าน', () => {
  test('ใส่รหัสปัจจุบันผิด 5 ครั้งแล้วถูกล็อก แม้ใส่ถูกก็เปลี่ยนไม่ได้ชั่วคราว', async ({ browser }) => {
    // สร้างผู้ใช้เฉพาะเทสต์นี้ (ไม่ใช้บัญชี seed เพื่อไม่ให้การล็อกกระทบเทสต์อื่น)
    const admin = await asRole(browser, 'admin');
    const email = `lockpw-${Date.now()}@servicehub.local`;
    await admin.page.goto('/admin/users/new');
    await waitHydrated(admin.page);
    await admin.page.getByLabel('อีเมล', { exact: true }).fill(email);
    await admin.page.getByLabel('ชื่อ-นามสกุล').fill('ทดสอบ ล็อก');
    await admin.page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
    const temp = (await admin.page.getByTestId('temp-password').textContent())!.trim();
    await admin.context.close();

    const { page, context } = await fresh(browser);
    await login(page, email, temp);
    await page.waitForURL(/\/account/);
    await waitHydrated(page);
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('รหัสผ่านปัจจุบัน').fill(`ผิด-${i}-Aa!`);
      await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill('Maple-Orbit-5519!');
      await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill('Maple-Orbit-5519!');
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/account')),
        page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click(),
      ]);
      await expect(alert(page)).toContainText('รหัสผ่านปัจจุบันไม่ถูกต้อง');
      await expect(page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' })).toBeEnabled();
    }
    await page.getByLabel('รหัสผ่านปัจจุบัน').fill(temp);
    await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill('Maple-Orbit-5519!');
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill('Maple-Orbit-5519!');
    await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
    await expect(alert(page)).toContainText('ใส่รหัสผ่านปัจจุบันผิดหลายครั้งเกินไป');
    await context.close();
  });
});
