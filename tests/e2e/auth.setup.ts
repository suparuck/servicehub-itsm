import { expect, test as setup } from '@playwright/test';
import { USERS, authFile, login, type UserKey } from './helpers';

// ล็อกอินแต่ละบทบาทหนึ่งครั้ง เก็บ session ไว้ใช้ซ้ำในทุกเทสต์ (หลัง global-setup ที่ seed ใหม่)
for (const key of Object.keys(USERS) as UserKey[]) {
  setup(`login as ${key}`, async ({ page }) => {
    await login(page, USERS[key]);
    await expect(page).toHaveURL(key === 'endUser' ? /\/portal$/ : /:\d+\/$/);
    await page.context().storageState({ path: authFile(key) });
  });
}
