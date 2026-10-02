import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { Role } from '@/lib/permissions';
import { checkAccess } from '@/lib/routeAccess';

/**
 * origin ที่ผู้ใช้เห็นจริง (โดเมนสาธารณะ) สำหรับสร้าง URL ของ redirect
 * ใน production ฝั่ง standalone `request.nextUrl` ใช้โฮสต์ภายในของเซิร์ฟเวอร์ (เช่น localhost:3000) ไม่ใช่โดเมนหลัง reverse proxy
 * จึงเลือกตามลำดับ: AUTH_URL (กำหนดไว้ตอน deploy) → X-Forwarded-Proto/Host → Host
 * redirect ไปที่ origin เดียวกับที่ผู้ใช้เรียกเข้ามาเสมอ (เฉพาะพาธภายใน ไม่รับค่าจากผู้ใช้)
 */
function publicOrigin(req: NextRequest): string {
  const configured = process.env.AUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* ค่าไม่ถูกต้อง → ใช้ header แทน */
    }
  }
  const first = (v: string | null) => v?.split(',')[0]?.trim();
  const proto = first(req.headers.get('x-forwarded-proto')) ?? req.nextUrl.protocol.replace(':', '');
  const host = first(req.headers.get('x-forwarded-host')) ?? req.headers.get('host') ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

/**
 * กั้นทุกหน้าที่ไม่ใช่หน้า login / ไฟล์ static (กติกาอยู่ใน lib/routeAccess.ts)
 *
 * ตั้งใจ **ไม่ใช้ wrapper `auth` ของ Auth.js** ใน middleware เพราะมันต่ออายุ cookie session (Set-Cookie)
 * ในทุกคำขอ รวมถึง prefetch ของ <Link> ที่ Next ทำใน production — คำขอที่ตอบกลับหลังผู้ใช้กด "ออกจากระบบ"
 * จะออก cookie ใหม่ทับ cookie ที่เพิ่งลบ ทำให้ออกจากระบบไม่สำเร็จ (พบจาก E2E บน build production)
 * ที่นี่อ่านและตรวจ token อย่างเดียว ไม่เขียน cookie
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const secure = (req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')) === 'https';
  const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie: secure });
  const decision = checkAccess(pathname, token?.role as Role | undefined);
  if (decision.allow) return NextResponse.next();

  // callbackUrl เป็นพาธภายในเท่านั้น (ไม่ใช่ URL เต็ม)
  const path = token ? decision.redirect : `/login?callbackUrl=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(new URL(path, publicOrigin(req)), 307);
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
