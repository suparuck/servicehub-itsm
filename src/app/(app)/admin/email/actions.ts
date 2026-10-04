'use server';

import { runAction } from '@/lib/actionUtils';
import { getCurrentUser } from '@/lib/currentUser';
import { sendTestMail } from '@/lib/mailAdminService';
import type { Role } from '@/lib/permissions';

export async function sendTestMailAction() {
  await runAction('/admin/email', async () => {
    const u = await getCurrentUser();
    await sendTestMail({ id: u.id, role: u.role as Role, name: u.name, email: u.email });
    return '/admin/email?sent=1';
  });
}
