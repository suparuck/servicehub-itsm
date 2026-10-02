import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// กั้นทุกหน้าที่ไม่ใช่หน้า login / ไฟล์ static (กติกาอยู่ใน lib/routeAccess.ts)
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
