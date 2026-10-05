// หน้าโมดูลที่ยังไม่พัฒนา — แสดงขอบเขตตามแนวปฏิบัติ ITIL 4 และทางไปยังส่วนที่ใช้งานได้แล้ว
// ไม่แสดงข้อมูลสมมติ: หน้าเหล่านี้บอกตรง ๆ ว่ายังไม่เปิดใช้งาน
export interface PlaceholderInfo {
  /** ต้องตรงกับ href ใน NAV (src/lib/nav.ts) */
  href: string;
  /** ชื่อแนวปฏิบัติ ITIL 4 */
  practice: string;
  summary: string;
  planned: string[];
  related: { label: string; href: string; note: string }[];
}

export const PLACEHOLDERS: PlaceholderInfo[] = [
  {
    href: '/releases',
    practice: 'Release Management',
    summary: 'รวม Change ที่เกี่ยวข้องเป็นรุ่นส่งมอบ วางแผน และติดตามการเปิดใช้งานสู่ production',
    planned: ['ทะเบียน Release และเวอร์ชัน', 'ผูก Change หลายรายการเข้ากับ Release เดียว', 'แผน deployment และเกณฑ์ผ่านก่อนเปิดใช้', 'บันทึกผลหลังเปิดใช้งาน'],
    related: [
      { label: 'Change Enablement', href: '/changes', note: 'รายการและการอนุมัติ Change (ใช้งานได้แล้ว)' },
      { label: 'ปฏิทิน Change & Problem', href: '/calendar', note: 'ดูช่วงดำเนินการและ Change ที่ชนกัน (ใช้งานได้แล้ว)' },
    ],
  },
];

export const placeholderFor = (path: string) => PLACEHOLDERS.find((p) => path === p.href || path.startsWith(`${p.href}/`));
