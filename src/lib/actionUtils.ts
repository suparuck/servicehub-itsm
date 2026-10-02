import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isDomainError } from './errors';

/**
 * ครอบ server action: ข้อผิดพลาดจากการใช้งานส่งกลับด้วย ?error= บนหน้าเดิม (ไม่ล้มทั้งหน้า)
 * `to` = หน้าที่ไปต่อเมื่อสำเร็จ (ค่าเริ่มต้น = หน้าเดิม)
 */
export async function runAction(back: string, fn: () => Promise<string | void>, to?: string): Promise<never> {
  let error: string | null = null;
  let dest: string | void = undefined;
  try {
    dest = await fn();
  } catch (e) {
    if (isDomainError(e)) error = e.message;
    else throw e;
  }
  revalidatePath('/', 'layout');
  if (error) redirect(`${back}${back.includes('?') ? '&' : '?'}error=${encodeURIComponent(error)}`);
  redirect(dest || to || back);
}
