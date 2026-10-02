import Link from 'next/link';
import { signOutAction } from '@/app/login/actions';
import { ROLE_LABEL, type Role } from '@/lib/permissions';

/** ชื่อผู้ใช้ บทบาท และปุ่มออกจากระบบ */
export function AccountMenu({ name, role, tone = 'dark' }: { name: string; role: Role; tone?: 'dark' | 'light' }) {
  const dark = tone === 'dark';
  return (
    <div className={dark ? 'mt-auto flex flex-col gap-1.5 border-t border-[#343A42] px-2 pt-3' : 'flex items-center gap-3'}>
      <div className="flex flex-col">
        <span className={dark ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-ink'}>{name}</span>
        <span className={dark ? 'text-xs text-[#9AA1AC]' : 'text-xs text-muted'}>{ROLE_LABEL[role]}</span>
      </div>
      <Link href="/account" className={dark ? 'inline-flex min-h-11 items-center rounded-control px-1 text-xs text-[#D9DCE1] underline hover:text-white' : 'inline-flex min-h-11 items-center px-1 text-xs text-ink underline hover:text-accent'}>
        บัญชีของฉัน
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          className={dark ? 'min-h-11 w-full rounded-control border border-[#4A515B] bg-transparent text-xs text-[#D9DCE1] hover:bg-sidebar-active' : 'min-h-11 rounded-control border border-input bg-surface px-3 text-xs text-ink hover:border-accent'}
        >
          ออกจากระบบ
        </button>
      </form>
    </div>
  );
}
