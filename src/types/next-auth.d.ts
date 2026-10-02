import type { DefaultSession } from 'next-auth';
import type { Role } from '@/lib/permissions';

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: Role } & DefaultSession['user'];
    /** เวลาล็อกอินจริง (วินาที) — Auth.js ออก iat ใหม่ทุกครั้งที่ต่ออายุ session จึงต้องเก็บเอง */
    authAt?: number;
  }
  interface User {
    role?: Role;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string;
    authAt?: number;
    role?: Role;
  }
}
