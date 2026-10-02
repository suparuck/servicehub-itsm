import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@/lib/permissions';

/**
 * การตั้งค่า Auth.js ที่ไม่แตะ DB/bcrypt (session, หน้า login, callbacks jwt/session)
 * ผู้ให้บริการล็อกอินและการตรวจรหัสผ่านอยู่ใน src/auth.ts · การกั้นหน้าอยู่ใน src/middleware.ts
 */
export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 ชั่วโมง = หนึ่งกะทำงาน
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.authAt = Date.now(); // มิลลิวินาที (ดู lib/session.ts)
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
