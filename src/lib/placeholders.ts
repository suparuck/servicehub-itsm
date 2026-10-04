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
  {
    href: '/catalogue',
    practice: 'Service Catalogue Management',
    summary: 'ทะเบียนบริการและข้อเสนอบริการ พร้อมเจ้าของ หมวดหมู่ และ SLA ที่ผูกอยู่',
    planned: ['จัดการ Service / Service Offering', 'กำหนดเจ้าของบริการและ SLA ที่ผูก', 'เผยแพร่รายการสู่แคตตาล็อกฝั่งผู้ใช้', 'ดูบริการที่ได้รับผลกระทบจาก CI/Change'],
    related: [
      { label: 'แคตตาล็อกบริการ (พอร์ทัล)', href: '/portal/catalog', note: 'รายการที่ผู้ใช้เห็นและขอได้ (ใช้งานได้แล้ว)' },
      { label: 'Service Level Management', href: '/sla', note: 'เป้าหมายและรายงาน SLA (ใช้งานได้แล้ว)' },
    ],
  },
  {
    href: '/assets',
    practice: 'IT Asset Management',
    summary: 'ติดตามสินทรัพย์ฮาร์ดแวร์และไลเซนส์ซอฟต์แวร์ตลอดวงจรชีวิต โดยผูกกับ CI ใน CMDB',
    planned: ['ทะเบียนสินทรัพย์ผูก 1:1 กับ CI ฮาร์ดแวร์/ไลเซนส์', 'วันที่ซื้อ การรับประกัน และผู้ถือครอง', 'แจ้งเตือนไลเซนส์ใกล้หมดอายุหรือใช้เกินสิทธิ์', 'ประวัติการโอนย้ายและการปลดระวาง'],
    related: [{ label: 'CMDB / Configuration', href: '/cmdb', note: 'CI ทุกคลาสรวมอุปกรณ์ปลายทางและไลเซนส์ (ใช้งานได้แล้ว)' }],
  },
  {
    href: '/improvement',
    practice: 'Continual Improvement',
    summary: 'ทะเบียนรายการปรับปรุงและการติดตามผลตามโมเดลการปรับปรุง 7 ขั้นของ ITIL 4',
    planned: ['ทะเบียนรายการปรับปรุงพร้อมเจ้าของและกำหนดเสร็จ', 'ติดตามขั้นตอน 1–7 ของโมเดลปรับปรุง', 'ผูกกับ Problem, SLA และผลสำรวจความพึงพอใจ', 'รายงานความคืบหน้าและผลลัพธ์'],
    related: [
      { label: 'แดชบอร์ด', href: '/', note: 'สรุปทะเบียนการปรับปรุงเบื้องต้นอยู่ที่แดชบอร์ด' },
      { label: 'Problem Management', href: '/problems', note: 'ปัญหาเรื้อรังที่เป็นต้นเรื่องของการปรับปรุง (ใช้งานได้แล้ว)' },
      { label: 'Service Level Management', href: '/sla', note: 'ตัวชี้วัดที่ใช้ตั้งเป้าหมาย (ใช้งานได้แล้ว)' },
    ],
  },
];

export const placeholderFor = (path: string) => PLACEHOLDERS.find((p) => path === p.href || path.startsWith(`${p.href}/`));
