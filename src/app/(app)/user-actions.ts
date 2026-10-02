'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DEMO_COOKIE, switchEnabled } from '@/lib/currentUser';
import { db } from '@/lib/db';

export async function switchUserAction(fd: FormData) {
  if (!switchEnabled()) return;
  const email = String(fd.get('email') ?? '');
  const user = await db.user.findUnique({ where: { email } });
  if (user && user.role !== 'END_USER') {
    (await cookies()).set(DEMO_COOKIE, email, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
  }
  revalidatePath('/', 'layout');
  redirect(String(fd.get('back') || '/'));
}
