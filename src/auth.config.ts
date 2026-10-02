import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@/lib/permissions';
import { checkAccess } from '@/lib/routeAccess';

/**
 * ส่วนของ Auth.js ที่ใช้บน edge (middleware) ได้ — ห้ามเรียก DB/bcrypt ที่นี่
 * ผู้ให้บริการล็อกอินและการตรวจรหัสผ่านอยู่ใน src/auth.ts
 */
export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 ชั่วโมง = หนึ่งกะทำงาน
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const decision = checkAccess(nextUrl.pathname, auth?.user?.role as Role | undefined);
      if (decision.allow) return true;
      if (!auth?.user) return false; // Auth.js ส่งไป /login พร้อม callbackUrl
      return Response.redirect(new URL(decision.redirect, nextUrl));
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.authAt = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      if (token.role) session.user.role = token.role as Role;
      session.authAt = token.authAt as number | undefined;
      return session;
    },
  },
} satisfies NextAuthConfig;
