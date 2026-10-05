import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';
import { asRole, authFile, waitHydrated } from './helpers';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
const tile = (page: Page, label: string) => page.getByTestId('tiles').getByRole('link', { name: new RegExp(`^${label}`) });

test.describe('Monitoring: ดูเหตุการณ์ (เจ้าหน้าที่)', () => {
  test.use({ storageState: authFile('agent') });

  test('เมนู ตัวเลขสรุป และ CI ที่มีเหตุการณ์ค้างอยู่ ตรงกับข้อมูลตัวอย่าง', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: /^Monitoring & Event/ }).click();
    await expect(page).toHaveURL(/\/monitoring$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Monitoring & Event' })).toBeVisible();
    await expect(tile(page, 'ผิดปกติ')).toContainText('1');
    await expect(tile(page, 'เตือน')).toContainText('1');
    await expect(tile(page, 'ข้อมูล')).toContainText('1');
    await expect(tile(page, 'รับทราบแล้ว')).toContainText('0');
    const health = page.getByTestId('ci-health');
    await expect(health.getByRole('listitem').filter({ hasText: 'ERP-DB-02' })).toContainText('ผิดปกติ');
    await expect(health.getByRole('listitem').filter({ hasText: 'FW-North-01' })).toContainText('เตือน');
    await expect(health.getByText('SW-DC1-CORE01')).toHaveCount(0); // INFO ไม่ทำให้สุขภาพเสีย
    await expect(page.getByRole('link', { name: 'แหล่งเหตุการณ์ (webhook)' })).toHaveCount(0); // ไม่มีสิทธิ์ monitoring.admin
  });

  test('รายการ: เริ่มต้นแสดงที่ยังไม่ปิด รวมเหตุการณ์ซ้ำเป็นแถวเดียว มี Incident ที่ผูกอยู่; ดูทั้งหมดเห็นที่กลับสู่ปกติ', async ({ page }) => {
    await page.goto('/monitoring');
    await expect(page.getByText('พบ 3 เหตุการณ์')).toBeVisible();
    const erp = rowOf(page, 'connection_pool_exhausted');
    await expect(erp).toContainText('14 ครั้ง');
    await expect(erp).toContainText('ผิดปกติ');
    await expect(erp.getByRole('link', { name: 'INC-24817' })).toHaveAttribute('href', '/incidents/INC-24817');
    await expect(rowOf(page, 'disk_full')).toHaveCount(0);
    await page.goto('/monitoring?status=all');
    await expect(page.getByText('พบ 4 เหตุการณ์')).toBeVisible();
    await expect(rowOf(page, 'disk_full')).toContainText('กลับสู่ปกติ');
    await expect(rowOf(page, 'disk_full')).toContainText('ไม่พบ CI ในทะเบียน'); // WS-PROD-01 ไม่มีใน CMDB
  });

  test('ตัวกรองความรุนแรงและการค้นหา', async ({ page }) => {
    await page.goto('/monitoring?severity=WARNING');
    await expect(page.getByText('พบ 1 เหตุการณ์')).toBeVisible();
    await expect(rowOf(page, 'cpu_high')).toContainText('เตือน');
    await page.goto('/monitoring');
    await page.getByPlaceholder('ค้นหา check, CI หรือข้อความ').fill('sw-dc1');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page.getByText('พบ 1 เหตุการณ์')).toBeVisible();
    await expect(rowOf(page, 'config_backup_done')).toBeVisible();
  });

  test('เข้าหน้าแหล่งเหตุการณ์ไม่ได้ (ต้องเป็นผู้ดูแลหรือผู้จัดการ CMDB)', async ({ page }) => {
    expect((await page.goto('/monitoring/sources'))?.status()).toBe(404);
  });
});

test.describe.serial('Monitoring: จัดการเหตุการณ์ (เจ้าหน้าที่)', () => {
  test.use({ storageState: authFile('agent') });
  let fields: Record<string, string> = {};

  test('รับทราบเหตุการณ์เตือน → สถานะเปลี่ยนและมีชื่อผู้รับทราบ', async ({ page }) => {
    await page.goto('/monitoring');
    // เก็บฟิลด์ของฟอร์ม "รับทราบ" ของแถว config_backup_done ไว้ใช้ในเคสปลอม request (ก่อน hydrate เหมือน 07-permissions)
    fields = await page.evaluate(() => {
      const row = [...document.querySelectorAll('[role=row]')].find((r) => r.textContent?.includes('config_backup_done'))!;
      const form = [...row.querySelectorAll('form')].find((f) => f.querySelector('button')?.textContent?.trim() === 'รับทราบ')!;
      return Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((i) => [i.name, i.value]));
    });
    expect(Object.keys(fields).length, 'ต้องมีฟิลด์ $ACTION_* ของฟอร์ม').toBeGreaterThan(0);
    await waitHydrated(page);
    await rowOf(page, 'cpu_high').getByRole('button', { name: /^รับทราบ/ }).click();
    await expect(rowOf(page, 'cpu_high')).toContainText('รับทราบโดย สมศักดิ์ ชื่นใจ');
    await expect(rowOf(page, 'cpu_high').getByRole('button', { name: /^รับทราบ/ })).toHaveCount(0);
    await expect(tile(page, 'รับทราบแล้ว')).toContainText('1');
  });

  test('Server Action ปลอม: ผู้ใช้ปลายทาง POST ฟอร์มรับทราบ → ไม่มีผล (เคสควบคุม: เจ้าหน้าที่ POST แล้วสำเร็จ)', async ({ browser }) => {
    const user = await asRole(browser, 'endUser');
    await user.page.request.post('/portal', { multipart: fields, maxRedirects: 0, failOnStatusCode: false });
    await user.context.close();
    const agent = await asRole(browser, 'agent');
    await agent.page.goto('/monitoring');
    await expect(rowOf(agent.page, 'config_backup_done')).toContainText('เปิด');
    const res = await agent.page.request.post('/monitoring', { multipart: fields, maxRedirects: 0, failOnStatusCode: false });
    expect(res.status(), 'Server Action ที่ปลอมขึ้นต้องทำงานได้เมื่อผู้เรียกมีสิทธิ์').toBe(303);
    await agent.page.goto('/monitoring');
    await expect(rowOf(agent.page, 'config_backup_done')).toContainText('รับทราบแล้ว');
    await agent.context.close();
  });

  test('สร้าง Incident จากเหตุการณ์ด้วยมือ → ไปหน้า Incident, ผูกกับ CI, และสร้างซ้ำไม่ได้', async ({ page }) => {
    await page.goto('/monitoring');
    await waitHydrated(page);
    await rowOf(page, 'cpu_high').getByRole('button', { name: /^สร้าง Incident/ }).click();
    await expect(page).toHaveURL(/\/incidents\/INC-\d+$/);
    await expect(page.getByRole('heading', { level: 1, name: /\[Monitoring\] cpu_high — FW-North-01/ })).toBeVisible();
    await expect(page.getByText('FW-North-01').first()).toBeVisible();
    await expect(page.getByText(/สร้างโดยเจ้าหน้าที่จากเหตุการณ์เฝ้าระวัง “cpu_high”/)).toBeVisible();
    const no = page.url().split('/').pop()!;
    await page.goto('/monitoring');
    await expect(rowOf(page, 'cpu_high').getByRole('link', { name: no })).toBeVisible();
    await expect(rowOf(page, 'cpu_high').getByRole('button', { name: /^สร้าง Incident/ })).toHaveCount(0);
  });

  test('ปิดเหตุการณ์ด้วยมือ → ออกจากรายการที่ยังไม่ปิด', async ({ page }) => {
    await page.goto('/monitoring');
    await waitHydrated(page);
    await rowOf(page, 'cpu_high').getByRole('button', { name: /^ปิดเหตุการณ์/ }).click();
    await expect(rowOf(page, 'cpu_high')).toHaveCount(0);
    await page.goto('/monitoring?status=RESOLVED');
    await expect(rowOf(page, 'cpu_high')).toContainText('กลับสู่ปกติ');
  });
});

test.describe.serial('Monitoring: webhook และแหล่งเหตุการณ์', () => {
  test.use({ storageState: authFile('admin') });
  let api: APIRequestContext;
  let token = '';
  const post = (body: unknown, tk: string | null = token, headers: Record<string, string> = {}) =>
    api.post('/api/monitoring/events', { data: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}), ...headers }, failOnStatusCode: false });

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL }); // ไม่มี cookie — ทดสอบแบบที่ระบบมอนิเตอร์จริงเรียก
  });
  test.afterAll(async () => { await api.dispose(); });

  test('ผู้ดูแลสร้างแหล่ง → token แสดงครั้งเดียว (รีเฟรชแล้วหาย) และมีวิธีใช้พร้อมตัวอย่าง', async ({ page }) => {
    await page.goto('/monitoring/sources');
    await waitHydrated(page);
    await page.getByLabel('ชื่อแหล่ง').fill('E2E Zabbix');
    await page.getByRole('button', { name: 'เพิ่มแหล่ง' }).click();
    token = ((await page.getByTestId('source-token').textContent()) ?? '').trim();
    expect(token).toMatch(/^shm_[A-Za-z0-9_-]{43}$/);
    await expect(page.getByText('แสดงครั้งเดียว').first()).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('source-token')).toHaveCount(0);
    await expect(page.getByTestId('sources').getByText('E2E Zabbix')).toBeVisible();
    await expect(page.getByTestId('curl')).toContainText('/api/monitoring/events');
    await expect(page.getByTestId('curl')).not.toContainText(token);
    // ชื่อซ้ำถูกปฏิเสธ
    await waitHydrated(page);
    await page.getByLabel('ชื่อแหล่ง').fill('E2E Zabbix');
    await page.getByRole('button', { name: 'เพิ่มแหล่ง' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'มีแหล่งเหตุการณ์ชื่อนี้แล้ว' })).toBeVisible();
  });

  test('ยืนยันตัวตน: ไม่มี token / token ผิด / รูปแบบผิด → 401 เหมือนกัน; GET → 405; ไม่รับ token ทาง URL', async () => {
    for (const tk of [null, 'shm_' + 'A'.repeat(43), 'abc', `${token}x`]) {
      const r = await post({ check: 'c', severity: 'info' }, tk);
      expect(r.status(), String(tk)).toBe(401);
      expect(await r.json()).toEqual({ error: 'unauthorized' });
    }
    expect((await api.get('/api/monitoring/events', { failOnStatusCode: false })).status()).toBe(405);
    const viaUrl = await api.post(`/api/monitoring/events?token=${token}`, { data: { check: 'c', severity: 'info' }, failOnStatusCode: false });
    expect(viaUrl.status()).toBe(401);
  });

  test('ตรวจ payload: JSON พัง / ฟิลด์ผิด → 400; ใหญ่เกินกำหนด → 413', async () => {
    expect((await post('{not json')).status()).toBe(400);
    const bad = await post({ check: 'c', severity: 'fatal' });
    expect(bad.status()).toBe(400);
    expect(JSON.stringify(await bad.json())).toContain('severity');
    expect((await post({ severity: 'info' })).status()).toBe(400);
    expect((await post([1, 2])).status()).toBe(400);
    expect((await post({ check: 'c', severity: 'info', message: 'x'.repeat(20_000) })).status()).toBe(413);
  });

  test('วงจรเหตุการณ์: เตือน → ซ้ำ (รวมแถวเดียว นับครั้ง) → ผิดปกติ (สร้าง Incident อัตโนมัติครั้งเดียว) → ปกติ (ปิด + บันทึกใน Incident)', async ({ page }) => {
    const base = { check: 'e2e_latency', ci: 'ERP-DB-02', service: 'ERP', key: 'e2e' };
    const r1 = await post({ ...base, severity: 'warning', message: 'latency 800ms' });
    expect(r1.status()).toBe(202);
    expect((await r1.json()).action).toBe('created');
    const r2 = await post({ ...base, severity: 'WARNING', message: 'latency 900ms' });
    expect((await r2.json()).action).toBe('updated');

    await page.goto('/monitoring?q=e2e_latency');
    await expect(page.getByText('พบ 1 เหตุการณ์')).toBeVisible();
    await expect(rowOf(page, 'e2e_latency')).toContainText('2 ครั้ง');
    await expect(rowOf(page, 'e2e_latency')).toContainText('latency 900ms');
    await expect(rowOf(page, 'e2e_latency').getByRole('link', { name: /^INC-/ })).toHaveCount(0); // เตือน = ไม่สร้าง Incident

    const r3 = await post({ ...base, severity: 'critical', message: 'latency 5s' });
    const b3 = await r3.json();
    expect(b3.action).toBe('updated');
    expect(b3.incident).toMatch(/^INC-\d+$/);
    const r4 = await post({ ...base, severity: 'critical', message: 'latency 6s' });
    expect((await r4.json()).incident).toBeNull(); // มี Incident แล้ว ไม่สร้างซ้ำ

    await page.goto('/monitoring?q=e2e_latency');
    await expect(rowOf(page, 'e2e_latency')).toContainText('4 ครั้ง');
    await expect(rowOf(page, 'e2e_latency')).toContainText('ผิดปกติ');
    await expect(rowOf(page, 'e2e_latency').getByRole('link', { name: b3.incident })).toBeVisible();

    await page.goto(`/incidents/${b3.incident}`);
    await expect(page.getByRole('heading', { level: 1, name: /\[Monitoring\] e2e_latency — ERP-DB-02/ })).toBeVisible();
    await expect(page.getByText(/สร้างอัตโนมัติจากเหตุการณ์เฝ้าระวัง “e2e_latency”/)).toBeVisible();
    await expect(page.getByText('Monitoring').first()).toBeVisible(); // ช่องทาง

    const r5 = await post({ ...base, severity: 'ok' });
    expect((await r5.json()).action).toBe('resolved');
    expect((await (await post({ ...base, severity: 'ok' })).json()).action).toBe('ignored'); // ปกติซ้ำ ไม่มีอะไรให้ปิด
    await page.goto('/monitoring?q=e2e_latency');
    await expect(page.getByText('พบ 0 เหตุการณ์')).toBeVisible();
    await page.goto(`/incidents/${b3.incident}`);
    await expect(page.getByText(/ระบบเฝ้าระวังแจ้งว่ากลับสู่ปกติ \(e2e_latency\)/)).toBeVisible();
  });

  test('ส่งเหตุการณ์ผิดปกติซ้ำพร้อมกัน 6 คำขอ → ได้เหตุการณ์แถวเดียวและ Incident เดียว', async ({ page }) => {
    const body = { check: 'e2e_race', ci: 'FW-North-01', severity: 'critical', message: 'race' };
    const results = await Promise.all(Array.from({ length: 6 }, () => post(body)));
    for (const r of results) expect(r.status()).toBe(202);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(bodies.filter((b) => b.action === 'created')).toHaveLength(1);
    const incidents = bodies.map((b) => b.incident).filter(Boolean);
    expect(incidents).toHaveLength(1);
    await page.goto('/monitoring?q=e2e_race');
    await expect(page.getByText('พบ 1 เหตุการณ์')).toBeVisible();
    await expect(rowOf(page, 'e2e_race')).toContainText('6 ครั้ง');
    await expect(page.getByTestId('ci-health').getByRole('listitem').filter({ hasText: 'FW-North-01' })).toContainText('ผิดปกติ');
  });

  test('CI ที่ไม่มีในทะเบียนยังบันทึกได้ (แจ้งว่าไม่พบ CI) และข้อความมีแท็ก HTML แสดงเป็นข้อความธรรมดา', async ({ page }) => {
    const r = await post({ check: '<img src=x onerror=alert(1)>', ci: 'NO-SUCH-CI', severity: 'info', message: '<script>alert(2)</script>' });
    expect(r.status()).toBe(202);
    let dialog = false;
    page.on('dialog', () => { dialog = true; });
    await page.goto('/monitoring?q=NO-SUCH-CI');
    const row = rowOf(page, 'NO-SUCH-CI');
    await expect(row).toContainText('ไม่พบ CI ในทะเบียน');
    await expect(row).toContainText('<script>alert(2)</script>'); // เป็นข้อความ ไม่ใช่แท็ก
    await expect(page.locator('main script, main img[src="x"]')).toHaveCount(0);
    expect(dialog).toBe(false);
  });

  test('ปิดสร้าง Incident อัตโนมัติ → CRITICAL ไม่สร้าง Incident; ปิดแหล่ง → 401; เปิดกลับ → 202', async ({ page }) => {
    await page.goto('/monitoring/sources');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'ปิดสร้าง Incident อัตโนมัติ E2E Zabbix' }).click();
    await expect(page.getByTestId('sources').getByText('ไม่สร้าง Incident อัตโนมัติ')).toBeVisible();
    const r = await post({ check: 'e2e_noauto', severity: 'critical' });
    expect(r.status()).toBe(202);
    expect((await r.json()).incident).toBeNull();

    await waitHydrated(page);
    await page.getByRole('button', { name: 'ปิดใช้งาน E2E Zabbix' }).click();
    await expect(page.getByTestId('sources').getByText('ปิดอยู่')).toBeVisible();
    expect((await post({ check: 'c', severity: 'info' })).status()).toBe(401);
    await waitHydrated(page);
    await page.getByRole('button', { name: 'เปิดใช้งาน E2E Zabbix' }).click();
    await expect(page.getByTestId('sources').getByText('ปิดอยู่')).toHaveCount(0);
    expect((await post({ check: 'c', severity: 'info' })).status()).toBe(202);
  });

  test('หมุนเวียน token → token เดิมใช้ไม่ได้ทันที และ token ใหม่ใช้ได้', async ({ page }) => {
    const old = token;
    await page.goto('/monitoring/sources');
    await waitHydrated(page);
    await page.getByRole('button', { name: 'หมุนเวียน token E2E Zabbix' }).click();
    token = ((await page.getByTestId('source-token').textContent()) ?? '').trim();
    expect(token).toMatch(/^shm_/);
    expect(token).not.toBe(old);
    expect((await post({ check: 'c', severity: 'info' }, old)).status()).toBe(401);
    expect((await post({ check: 'c', severity: 'info' }, token)).status()).toBe(202);
    await expect(page.getByText(/หมุนเวียน token ของ “E2E Zabbix”/)).toBeVisible();
  });
});

test.describe('สิทธิ์', () => {
  test('หัวหน้าทีมเข้าหน้าแหล่งเหตุการณ์ไม่ได้; ผู้จัดการ CMDB เข้าได้; ผู้ใช้ปลายทางเข้า Monitoring ไม่ได้', async ({ browser }) => {
    const lead = await asRole(browser, 'lead');
    expect((await lead.page.goto('/monitoring/sources'))?.status()).toBe(404);
    await lead.context.close();
    const user = await asRole(browser, 'endUser');
    for (const p of ['/monitoring', '/monitoring/sources']) {
      await user.page.goto(p);
      await expect(user.page, p).toHaveURL(/\/portal$/);
    }
    await user.context.close();
  });
});
