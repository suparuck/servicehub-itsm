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
    href: '/service-desk',
    practice: 'Service Desk',
    summary: 'จุดติดต่อเดียวของผู้ใช้กับทีม IT: รับเรื่องจากทุกช่องทางแล้วส่งต่อให้ถูกทีม',
    planned: ['คิวรวมของ Incident และ Service Request จากทุกช่องทาง', 'บันทึกเรื่องที่รับทางโทรศัพท์/อีเมลแทนผู้ใช้', 'กฎมอบหมายอัตโนมัติตามบริการและกลุ่มผู้รับผิดชอบ', 'ข้อความตอบกลับสำเร็จรูป (macros)'],
    related: [
      { label: 'Incident Management', href: '/incidents', note: 'คิวและรายละเอียด Incident (ใช้งานได้แล้ว)' },
      { label: 'Service Request', href: '/requests', note: 'คิวคำขอบริการและการอนุมัติ (ใช้งานได้แล้ว)' },
      { label: 'พอร์ทัลบริการตนเอง', href: '/portal', note: 'ช่องทางแจ้งปัญหา/ขอบริการของผู้ใช้ (ใช้งานได้แล้ว)' },
    ],
  },
  {
    href: '/monitoring',
    practice: 'Monitoring and Event Management',
    summary: 'รับเหตุการณ์จากระบบเฝ้าระวัง คัดกรอง และเปลี่ยนเป็น Incident เมื่อมีผลกระทบต่อบริการ',
    planned: ['รับ event จากระบบมอนิเตอร์ภายนอก (webhook)', 'จัดกลุ่ม/ตัดเหตุการณ์ซ้ำ (correlation)', 'สร้าง Incident อัตโนมัติและผูกกับ CI ที่เกี่ยวข้อง', 'มุมมองสถานะสุขภาพของ CI ตามบริการ'],
    related: [
      { label: 'Incident Management', href: '/incidents', note: 'ปลายทางของเหตุการณ์ที่ต้องดำเนินการ' },
      { label: 'CMDB / Configuration', href: '/cmdb', note: 'CI และแผนผังความสัมพันธ์ที่ใช้ประเมินผลกระทบ' },
    ],
  },
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
