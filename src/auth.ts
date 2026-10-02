import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import type { Provider } from 'next-auth/providers';
import { authConfig } from './auth.config';
import { db } from './lib/db';
import type { Role } from './lib/permissions';

// ใช้เทียบรหัสผ่านเมื่อไม่พบผู้ใช้ เพื่อให้เวลาตอบสนองไม่บอกว่าอีเมลนี้มีอยู่หรือไม่
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);

export const entraEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET && process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);

const providers: Provider[] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const email = String(raw?.email ?? '').trim().toLowerCase();
      const password = String(raw?.password ?? '');
      if (!email || !password || password.length > 200) return null;
      const user = await db.user.findUnique({ where: { email } });
      const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !user.active || !user.passwordHash || !ok) return null;
      await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return { id: user.id, email: user.email, name: user.name, role: user.role as Role };
    },
  }),
];

// Microsoft Entra ID (Azure AD): เปิดใช้เมื่อกำหนด AUTH_MICROSOFT_ENTRA_ID_{ID,SECRET,ISSUER}
// รับเฉพาะผู้ใช้ที่มีอยู่ในระบบแล้ว (จับคู่ด้วยอีเมล) — ไม่สร้างบัญชีอัตโนมัติ เพื่อให้ผู้ดูแลกำหนดบทบาทเอง
if (entraEnabled) providers.push(MicrosoftEntraID({}));

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  trustHost: true,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile, user }) {
      if (account?.provider === 'credentials') return true;
      const email = (profile?.email ?? user.email ?? '').toLowerCase();
      const local = email ? await db.user.findUnique({ where: { email } }) : null;
      if (!local || !local.active) return false; // ไม่อยู่ในระบบ → ปฏิเสธ
      user.id = local.id;
      user.role = local.role as Role;
      await db.user.update({ where: { id: local.id }, data: { lastLoginAt: new Date() } });
      return true;
    },
    jwt: authConfig.callbacks.jwt,
    session: authConfig.callbacks.session,
  },
});
