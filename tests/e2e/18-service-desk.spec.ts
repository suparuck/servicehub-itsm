import { expect, test, type Page } from '@playwright/test';
import { asRole, authFile, USERS, waitHydrated } from './helpers';
import { linkIn, waitForMail } from './mail';

const caller = 'มณีรัตน์ กิจเจริญ';
const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
const count = (page: Page, tab: string) => page.getByTestId(`count-${tab}`);
const tabLink = (page: Page, name: string | RegExp) => page.getByRole('navigation', { name: 'มุมมองคิว' }).getByRole('link', { name });

/** เลือกผู้แจ้งตามชื่อ (ค่าของตัวเลือกคือ id ซึ่งไม่รู้ล่วงหน้า) */
async function pickCaller(page: Page) {
  const select = page.getByLabel(/^ผู้แจ้ง/);
  await select.selectOption((await select.locator('option', { hasText: caller }).getAttribute('value'))!);
}

/** บันทึกแทนผู้ใช้ (Incident) แล้วคืนเลขที่ */
async function logIncident(page: Page, o: { title: string; channel?: string; service?: string }) {
  await page.goto('/service-desk/new');
  await waitHydrated(page);
  await pickCaller(page);
  if (o.channel) await page.getByLabel(/^ช่องทางที่ติดต่อเข้ามา/).selectOption(o.channel);
  await page.getByLabel(/^หัวข้อ/).fill(o.title);
  if (o.service) await page.getByLabel('บริการที่เกี่ยวข้อง').selectOption({ label: o.service });
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page).toHaveURL(/\/incidents\/INC-\d+$/);
  return page.url().split('/').pop()!;
}

test.describe('Service Desk: คิวรวม', () => {
  test.use({ storageState: authFile('agent') });

  test('เมนูเปิดหน้าได้ แท็บและตัวเลขสอดคล้องกับรายการที่แสดง', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: /^Service Desk/ }).click();
    await expect(page).toHaveURL(/\/service-desk$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Service Desk' })).toBeVisible();
    const all = Number(await count(page, 'all').textContent());
    expect(all).toBeGreaterThan(0);
    await expect(page.getByText(`พบ ${all} รายการ`)).toBeVisible();
    for (const [tab, name] of [['unassigned', /^ยังไม่มอบหมาย/], ['mine', /^ของฉัน/], ['risk', /^เสี่ยง SLA/]] as const) {
      const n = Number(await count(page, tab).textContent());
      await tabLink(page, name).click();
      await expect(page.getByText(`พบ ${n} รายการ`)).toBeVisible();
    }
  });

  test('กรองประเภท: เฉพาะคำขอบริการ / เฉพาะ Incident', async ({ page }) => {
    await page.goto('/service-desk?type=REQ');
    await expect(page.getByText(/พบ \d+ รายการ/)).toBeVisible();
    await expect(rowOf(page, 'INC-')).toHaveCount(0);
    await expect(rowOf(page, 'REQ-').first()).toContainText('คำขอ');
    await page.goto('/service-desk?type=INC');
    await expect(rowOf(page, 'REQ-')).toHaveCount(0);
    await expect(rowOf(page, 'INC-').first()).toBeVisible();
  });

  test('เสี่ยง SLA: INC-24817 (P1 ใกล้เกิน) อยู่แท็บเสี่ยง พร้อมข้อความกำกับ', async ({ page }) => {
    await page.goto('/service-desk?tab=risk');
    await expect(rowOf(page, 'INC-24817')).toContainText(/ใกล้เกิน SLA|เกิน SLA/);
    await expect(rowOf(page, 'INC-24817').getByRole('link', { name: 'INC-24817' })).toHaveAttribute('href', '/incidents/INC-24817');
  });

  test('เจ้าหน้าที่ทั่วไปไม่เห็นเมนูจัดการ (กฎ/ข้อความสำเร็จรูป/มอบหมายให้ผู้อื่น) และเข้าหน้าจัดการไม่ได้', async ({ page }) => {
    await page.goto('/service-desk');
    await expect(page.getByRole('link', { name: 'กฎมอบหมายอัตโนมัติ' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'ข้อความสำเร็จรูป' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^มอบหมาย INC/ })).toHaveCount(0);
    for (const p of ['/service-desk/rules', '/service-desk/macros']) expect((await page.goto(p))?.status(), p).toBe(404);
  });
});

test.describe.serial('Service Desk: บันทึกแทนผู้ใช้ รับงาน และมอบหมาย', () => {
  test.use({ storageState: authFile('lead') });
  let ruled = ''; // ตรงกฎ ERP → Application Support / ธนพล
  let plain = ''; // ไม่ตรงกฎเฉพาะ → ค่าเริ่มต้น Service Desk L1 ไม่มีผู้รับผิดชอบ
  let claimFields: Record<string, string> = {};

  test('บันทึก Incident ของ ERP ทางโทรศัพท์ → มอบหมายอัตโนมัติตามกฎ และเป็นเรื่องของผู้ใช้นั้น', async ({ page, browser }) => {
    ruled = await logIncident(page, { title: 'E2E-DESK: เปิด ERP ไม่ได้ (โทรเข้า)', channel: 'โทรศัพท์', service: 'ERP' });
    await expect(page.getByText('Application Support').first()).toBeVisible();
    await expect(page.getByText('ธนพล ศรีสุข').first()).toBeVisible();
    await expect(page.getByText(/มอบหมายอัตโนมัติตามกฎ “ERP → Application Support”/)).toBeVisible();
    await expect(page.getByText(/บันทึกแทน มณีรัตน์ กิจเจริญ ผ่านช่องทางโทรศัพท์/)).toBeVisible();

    // ผู้ใช้เห็นเรื่องในพอร์ทัลของตนเอง
    const user = await asRole(browser, 'endUser');
    expect((await user.page.goto(`/portal/my/${ruled}`))?.status()).toBe(200);
    await expect(user.page.getByText('E2E-DESK: เปิด ERP ไม่ได้ (โทรเข้า)').first()).toBeVisible();
    await user.context.close();
    // และได้อีเมลรับเรื่อง
    const mail = await waitForMail(USERS.endUser, new RegExp(`รับเรื่องแล้ว ${ruled}`));
    expect(linkIn(mail, `/portal/my/${ruled}`)).toContain(ruled);
  });

  test('บันทึกโดยไม่ระบุบริการ → ตกกฎค่าเริ่มต้น (Service Desk L1) และยังไม่มีผู้รับผิดชอบ', async ({ page }) => {
    plain = await logIncident(page, { title: 'E2E-DESK: ถามวิธีตั้งค่าเมลบนมือถือ', channel: 'อีเมล' });
    await expect(page.getByText('Service Desk L1').first()).toBeVisible();
    await expect(page.getByText(/มอบหมายอัตโนมัติตามกฎ “ค่าเริ่มต้น → Service Desk L1”/)).toBeVisible();
    await page.goto('/service-desk?tab=unassigned');
    await expect(rowOf(page, plain)).toContainText('ยังไม่มอบหมาย');
    await expect(rowOf(page, plain)).toContainText('อีเมล');
    await expect(rowOf(page, ruled)).toHaveCount(0); // รายการที่ตรงกฎมีผู้รับผิดชอบแล้ว
  });

  test('หัวหน้าทีมมอบหมายให้เจ้าหน้าที่ → ขึ้นเป็นของคนนั้น และสถานะเป็น "มอบหมายแล้ว"', async ({ page }) => {
    // เก็บฟิลด์ของฟอร์ม "รับงาน" ของแถวนี้ไว้ใช้ในเคสปลอม request (ก่อน hydrate เหมือน 07-permissions)
    await page.goto('/service-desk?tab=unassigned');
    claimFields = await page.evaluate((no) => {
      const row = [...document.querySelectorAll('[role=row]')].find((r) => r.textContent?.includes(no))!;
      const form = [...row.querySelectorAll('form')].find((f) => f.querySelector('button')?.textContent?.trim() === 'รับงาน')!;
      return Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((i) => [i.name, i.value]));
    }, plain);
    expect(Object.keys(claimFields).length, 'ต้องมีฟิลด์ $ACTION_* ของฟอร์ม').toBeGreaterThan(0);
    await waitHydrated(page);
    const row = rowOf(page, plain);
    await row.getByLabel(/^มอบหมายให้/).selectOption({ label: 'สมศักดิ์ ชื่นใจ' });
    await row.getByRole('button', { name: /^มอบหมาย INC/ }).click();
    await expect(page).toHaveURL(/\/service-desk$/);
    await page.goto('/service-desk?tab=unassigned');
    await expect(rowOf(page, plain)).toHaveCount(0);
    await page.goto('/service-desk');
    await expect(rowOf(page, plain)).toContainText('สมศักดิ์ ชื่นใจ');
    await expect(rowOf(page, plain)).toContainText('มอบหมายแล้ว');
  });

  test('รับงานที่มีผู้รับผิดชอบแล้วไม่ได้: ส่งฟอร์มรับงานปลอมซ้ำ → ถูกปฏิเสธด้วยข้อความ และเจ้าของเดิมไม่เปลี่ยน', async ({ page, browser }) => {
    // เรื่องนี้ถูกมอบหมายให้สมศักดิ์แล้ว — หัวหน้าทีม (มีสิทธิ์ incident.manage) พยายามรับงานซ้ำด้วยฟอร์มเดิม
    const res = await page.request.post('/service-desk', { multipart: claimFields, maxRedirects: 0, failOnStatusCode: false });
    expect(res.status()).toBe(303);
    expect(decodeURIComponent(res.headers()['location'] ?? '')).toContain('มีผู้รับผิดชอบแล้ว');
    const agent = await asRole(browser, 'agent');
    await agent.page.goto('/service-desk?tab=mine');
    await expect(rowOf(agent.page, plain)).toContainText('สมศักดิ์ ชื่นใจ');
    await agent.context.close();
  });

  test('บันทึกคำขอบริการแทนผู้ใช้ → ไปหน้าคำขอ และผู้ใช้เห็นในพอร์ทัล', async ({ page, browser }) => {
    await page.goto('/service-desk/new');
    await waitHydrated(page);
    await pickCaller(page);
    await page.getByLabel(/^ช่องทางที่ติดต่อเข้ามา/).selectOption('Walk-in');
    await page.getByLabel(/ขอบริการ \(Service Request\)/).check();
    await page.getByLabel(/^หัวข้อ/).fill('E2E-DESK: ขอติดตั้งโปรแกรม Visio');
    const item = page.getByLabel(/^รายการที่ขอ/).locator('option', { hasText: 'ซอฟต์แวร์และไลเซนส์' });
    await page.getByLabel(/^รายการที่ขอ/).selectOption((await item.getAttribute('value'))!);
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page).toHaveURL(/\/requests\/REQ-\d+$/);
    const req = page.url().split('/').pop()!;
    await expect(page.getByText(/บันทึกแทนผู้ใช้ มณีรัตน์ กิจเจริญ ผ่านช่องทางWalk-in/)).toBeVisible();

    const user = await asRole(browser, 'endUser');
    expect((await user.page.goto(`/portal/my/${req}`))?.status()).toBe(200);
    await user.context.close();
    await page.goto('/service-desk?type=REQ');
    await expect(rowOf(page, req)).toContainText('รออนุมัติ');
  });
});

test.describe.serial('Service Desk: กฎมอบหมายอัตโนมัติ', () => {
  test.use({ storageState: authFile('lead') });
  let fields: Record<string, string> = {};

  test('เพิ่มกฎของบริการ VPN → Incident VPN ตกกลุ่ม Network Ops; ปิดกฎแล้วถอยไปค่าเริ่มต้น; ลบกฎได้', async ({ page }) => {
    await page.goto('/service-desk/rules');
    // เก็บฟิลด์ของฟอร์ม "เพิ่มกฎ" ไว้ใช้ในเคสปลอม request (ก่อน hydrate)
    fields = await page.evaluate(() => {
      const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('input[name=name]'))!;
      return Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((i) => [i.name, i.value]));
    });
    expect(Object.keys(fields).length).toBeGreaterThan(0);
    await waitHydrated(page);
    await page.getByLabel('ชื่อกฎ').fill('E2E VPN → Network Ops');
    await page.getByLabel(/^บริการ/).selectOption({ label: 'Remote Access / VPN' });
    await page.getByLabel('กลุ่มผู้รับผิดชอบ').selectOption({ label: 'Network Ops' });
    await page.getByLabel(/^ลำดับ/).fill('1');
    await page.getByRole('button', { name: 'เพิ่มกฎ' }).click();
    await expect(page.getByTestId('rules').getByText('E2E VPN → Network Ops')).toBeVisible();
    await expect(page.getByText(/เพิ่มกฎมอบหมายอัตโนมัติ “E2E VPN/)).toBeVisible();

    const withRule = await logIncident(page, { title: 'E2E-DESK: VPN หลุด', channel: 'แชต', service: 'Remote Access / VPN' });
    await expect(page.getByText(/มอบหมายอัตโนมัติตามกฎ “E2E VPN → Network Ops”/)).toBeVisible();
    expect(withRule).toMatch(/^INC-/);

    await page.goto('/service-desk/rules');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'ปิด E2E VPN → Network Ops' }).click();
    await expect(page.getByTestId('rules').getByText('ปิดอยู่')).toBeVisible();
    await logIncident(page, { title: 'E2E-DESK: VPN หลุดอีกครั้ง', channel: 'แชต', service: 'Remote Access / VPN' });
    await expect(page.getByText(/ค่าเริ่มต้น → Service Desk L1/)).toBeVisible(); // กฎปิดแล้ว → ใช้ค่าเริ่มต้น

    await page.goto('/service-desk/rules');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'ลบ E2E VPN → Network Ops' }).click();
    await expect(page.getByTestId('rules').getByText('E2E VPN → Network Ops')).toHaveCount(0);
  });

  test('Server Action ปลอม: เจ้าหน้าที่ทั่วไป POST ฟอร์มเพิ่มกฎของหัวหน้าทีม → ไม่มีผล (เคสควบคุม: หัวหน้าทีม POST แล้วสำเร็จ)', async ({ browser }) => {
    const multipart = { ...fields, name: 'E2E กฎปลอม', serviceId: '', groupId: fields['groupId'] ?? '', assigneeId: '', sortOrder: '5' };
    // groupId ไม่อยู่ในฟิลด์ซ่อน — ดึงจากตัวเลือกจริงของหน้า
    const lead = await asRole(browser, 'lead');
    await lead.page.goto('/service-desk/rules');
    const groupId = await lead.page.getByLabel('กลุ่มผู้รับผิดชอบ').locator('option', { hasText: 'Network Ops' }).getAttribute('value');
    multipart.groupId = groupId!;

    const agent = await asRole(browser, 'agent');
    await agent.page.request.post('/service-desk/rules', { multipart, maxRedirects: 0, failOnStatusCode: false });
    await lead.page.reload();
    await expect(lead.page.getByTestId('rules').getByText('E2E กฎปลอม')).toHaveCount(0);
    await agent.context.close();

    const res = await lead.page.request.post('/service-desk/rules', { multipart, maxRedirects: 0, failOnStatusCode: false });
    expect(res.status(), 'ฟอร์มที่ปลอมต้องใช้งานได้เมื่อผู้เรียกมีสิทธิ์').toBe(303);
    await lead.page.reload();
    await expect(lead.page.getByTestId('rules').getByText('E2E กฎปลอม')).toBeVisible();
    await lead.page.getByRole('button', { name: 'ลบ E2E กฎปลอม' }).click();
    await expect(lead.page.getByTestId('rules').getByText('E2E กฎปลอม')).toHaveCount(0);
    await lead.context.close();
  });
});

test.describe.serial('Service Desk: ข้อความสำเร็จรูป', () => {
  test.use({ storageState: authFile('lead') });
  let incident = '';

  test('เพิ่มข้อความ → แทรกในโน้ตของ Incident โดยแทนตัวแปรด้วยชื่อผู้แจ้ง เลขที่ และชื่อผู้ตอบ', async ({ page }) => {
    await page.goto('/service-desk/macros');
    await waitHydrated(page);
    await page.getByLabel('ชื่อข้อความ').fill('E2E ทักทาย');
    await page.getByLabel('เนื้อหา').fill('เรียนคุณ{{ชื่อ}} เรื่อง {{เลขที่}} จาก {{เจ้าหน้าที่}} {{ตัวแปรไม่มี}}');
    await page.getByRole('button', { name: 'เพิ่มข้อความ' }).click();
    await expect(page.getByTestId('macros').getByText('E2E ทักทาย')).toBeVisible();

    incident = await logIncident(page, { title: 'E2E-DESK: ทดสอบข้อความสำเร็จรูป', channel: 'โทรศัพท์' });
    await waitHydrated(page, 'form');
    await page.getByLabel('ข้อความสำเร็จรูป').selectOption({ label: 'E2E ทักทาย' });
    await page.getByRole('button', { name: 'แทรกข้อความ' }).click();
    await expect(page.locator('#note')).toHaveValue(`เรียนคุณ${caller} เรื่อง ${incident} จาก วรรณา ใจดี {{ตัวแปรไม่มี}}`);
  });

  test('ข้อความที่ปิดอยู่ไม่ขึ้นในตัวเลือก; เจ้าหน้าที่ทั่วไปใช้ข้อความที่เปิดอยู่ได้', async ({ page, browser }) => {
    await page.goto('/service-desk/macros');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'ปิด E2E ทักทาย' }).click();
    await expect(page.getByTestId('macros').getByText('ปิดอยู่')).toBeVisible();

    const agent = await asRole(browser, 'agent');
    await agent.page.goto(`/incidents/${incident}`);
    const options = await agent.page.getByLabel('ข้อความสำเร็จรูป').locator('option').allTextContents();
    expect(options).toContain('ยืนยันรับเรื่อง'); // ข้อความตัวอย่างที่เปิดอยู่
    expect(options).not.toContain('E2E ทักทาย');
    await agent.context.close();

    await page.getByRole('button', { name: 'ลบ E2E ทักทาย' }).click();
    await expect(page.getByTestId('macros').getByText('E2E ทักทาย')).toHaveCount(0);
  });
});

test.describe('สิทธิ์', () => {
  test.use({ storageState: authFile('endUser') });

  test('ผู้ใช้ปลายทางเข้า Service Desk ทุกหน้าไม่ได้ (ถูกส่งกลับพอร์ทัล)', async ({ page }) => {
    for (const p of ['/service-desk', '/service-desk/new', '/service-desk/rules', '/service-desk/macros']) {
      await page.goto(p);
      await expect(page, p).toHaveURL(/\/portal$/);
    }
  });
});

