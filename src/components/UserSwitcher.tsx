import { ROLE_LABEL, type Role } from '@/lib/permissions';
import { switchUserAction } from '@/app/(app)/user-actions';

/** ตัวสลับผู้ใช้ตัวอย่าง (เฉพาะช่วงที่ยังไม่มี Auth) — ใช้ทดสอบสิทธิ์ตามบทบาท */
export function UserSwitcher({ users, currentEmail }: { users: { email: string; name: string; role: Role }[]; currentEmail: string }) {
  return (
    <form action={switchUserAction} className="mt-auto flex flex-col gap-1.5 border-t border-[#343A42] px-2 pt-3">
      <label htmlFor="demo-user" className="text-[11px] font-semibold tracking-[0.04em] text-[#8C93A0]">ผู้ใช้ตัวอย่าง (ทดสอบสิทธิ์)</label>
      <select id="demo-user" name="email" defaultValue={currentEmail} className="box-border min-h-11 w-full rounded-control border border-[#343A42] bg-sidebar-active px-2 text-xs text-white">
        {users.map((u) => (
          <option key={u.email} value={u.email}>{u.name} · {ROLE_LABEL[u.role]}</option>
        ))}
      </select>
      <button type="submit" className="min-h-11 rounded-control border border-[#4A515B] bg-transparent text-xs text-[#D9DCE1] hover:bg-sidebar-active">สลับผู้ใช้</button>
    </form>
  );
}
