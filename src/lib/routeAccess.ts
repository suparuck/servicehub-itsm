// กติกาเข้าถึงหน้า (ใช้ใน middleware — ห้าม import DB/Node API เพราะรันบน edge)
import type { Role } from './permissions';

export type Access = { allow: true } | { allow: false; redirect: string };

const PUBLIC = [/^\/login(\/|$)/, /^\/forgot-password(\/|$)/, /^\/reset-password(\/|$)/, /^\/api\/auth(\/|$)/, /^\/api\/monitoring\/events$/];

export const homeFor = (role: Role | undefined | null) => (role === 'END_USER' ? '/portal' : '/');

export function checkAccess(pathname: string, role: Role | undefined | null): Access {
  if (PUBLIC.some((p) => p.test(pathname))) return { allow: true };
  if (!role) return { allow: false, redirect: '/login' };
  // หน้าบัญชีของตนเอง (เปลี่ยนรหัสผ่าน) — ทุกบทบาทที่ล็อกอินแล้ว
  if (pathname === '/account' || pathname.startsWith('/account/')) return { allow: true };
  // การแจ้งเตือนของตนเอง — ทุกบทบาทที่ล็อกอินแล้ว
  if (pathname === '/notifications' || /^\/notifications\/open\/[^/]+$/.test(pathname)) return { allow: true };
  const isPortal = pathname === '/portal' || pathname.startsWith('/portal/');
  // พอร์ทัลเปิดให้ทุกบทบาทที่ล็อกอินแล้ว · หน้าเจ้าหน้าที่ปิดสำหรับผู้ใช้ปลายทาง
  if (!isPortal && role === 'END_USER') return { allow: false, redirect: '/portal' };
  return { allow: true };
}

/**
 * callbackUrl → พาธภายในเท่านั้น (กัน open redirect)
 * Next/Auth.js อาจส่ง URL เต็ม (http://host/path) จึงดึงเฉพาะ path+query ทิ้งโฮสต์ — จึงไม่มีทางพาไปเว็บอื่น
 */
export function safeCallback(url: string | null | undefined, fallback = '/'): string {
  let p = url ?? '';
  if (/^https?:[/][/]/i.test(p)) {
    try {
      const u = new URL(p);
      p = u.pathname + u.search;
    } catch {
      return fallback;
    }
  }
  const bad = !p.startsWith('/') || p.startsWith('//') || p.startsWith('/' + String.fromCharCode(92)) || p.startsWith('/login');
  return bad ? fallback : p;
}
