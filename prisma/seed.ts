// Seed จาก mock data ใน design/*.dc.html (Main, Incident, CMDB, Portal)
// ข้อมูลที่เกี่ยวกับเวลา สร้างเทียบกับ "ตอนนี้" เพื่อให้ SLA/กำหนดการ Change ไม่ล้าสมัย
import { PrismaClient, type Level, type IncidentStatus, type Priority } from '@prisma/client';
import { calcPriority } from '../src/lib/priority';

const prisma = new PrismaClient();
const now = new Date();
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const minutesAhead = (m: number) => new Date(now.getTime() + m * 60_000);

const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
/** วันที่ (ตามเวลาไทย) เลื่อนจากวันนี้ + เวลา HH:MM → UTC Date */
function bkk(dayOffset: number, hhmm: string): Date {
  const base = new Date(`${todayBkk}T${hhmm}:00+07:00`);
  return new Date(base.getTime() + dayOffset * 86_400_000);
}

const TARGET: Record<Priority, number> = { P1: 240, P2: 300, P3: 600, P4: 2880 };

async function truncateAll() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main() {
  if (process.env.SEED_IF_EMPTY && (await prisma.user.count()) > 0) {
    console.log('ฐานข้อมูลมีข้อมูลอยู่แล้ว — ข้าม seed (ใช้ `npx prisma db seed` เพื่อล้างและ seed ใหม่)');
    return;
  }
  await truncateAll();

  // ── กลุ่มผู้รับผิดชอบ ───────────────────────────────────────────
  const groupNames = [
    'Service Desk L1', 'Application Support', 'Network Ops', 'Messaging',
    'Desktop Support', 'Data Platform', 'DBA Team', 'HRIS Team',
  ];
  const group: Record<string, string> = {};
  for (const name of groupNames) group[name] = (await prisma.assignmentGroup.create({ data: { name } })).id;

  // ── ผู้ใช้ (ตัวอย่างตามบทบาท) ──────────────────────────────────
  const mkUser = async (email: string, name: string, initials: string, role: any, g?: string) =>
    (await prisma.user.create({ data: { email, name, initials, role, groupId: g ? group[g] : null } })).id;
  const me = await mkUser('somsak@servicehub.local', 'สมศักดิ์ ชื่นใจ', 'สช', 'AGENT', 'Service Desk L1');
  const thanaphon = await mkUser('thanaphon@servicehub.local', 'ธนพล ศรีสุข', 'ธศ', 'AGENT', 'Application Support');
  const wanna = await mkUser('wanna@servicehub.local', 'วรรณา ใจดี', 'วจ', 'RESOLVER_GROUP_LEAD', 'Application Support');
  const somchai = await mkUser('somchai@servicehub.local', 'สมชาย ก.', 'สก', 'CONFIG_MANAGER', 'DBA Team');
  await mkUser('cab@servicehub.local', 'ประเสริฐ ตรีรัตน์', 'ปต', 'CAB_MEMBER');
  await mkUser('change@servicehub.local', 'กมลา วงศ์ไทย', 'กว', 'CHANGE_MANAGER');
  await mkUser('admin@servicehub.local', 'ผู้ดูแลระบบ', 'ผด', 'ADMIN');
  const employee = await mkUser('employee@servicehub.local', 'มณีรัตน์ กิจเจริญ', 'มก', 'END_USER');

  // ── SLA ────────────────────────────────────────────────────────
  const sla = await prisma.sla.create({
    data: {
      name: 'SLA มาตรฐานองค์กร',
      calendar: '24x7',
      targets: {
        create: (['P1', 'P2', 'P3', 'P4'] as Priority[]).flatMap((p) => [
          { priority: p, metric: 'RESPONSE' as const, minutes: { P1: 15, P2: 30, P3: 120, P4: 480 }[p] },
          { priority: p, metric: 'RESOLVE' as const, minutes: TARGET[p] },
        ]),
      },
    },
  });

  // ── บริการ (Service Catalogue) ──────────────────────────────────
  const svcDefs = [
    { code: 'ERP', name: 'ERP', fullName: 'บริการ ERP', health: 'DOWN', category: 'แอปพลิเคชันธุรกิจ', owner: 'ฝ่ายบัญชีและการเงิน' },
    { code: 'VPN', name: 'Remote Access / VPN', fullName: 'บริการ Remote Access', health: 'DEGRADED', category: 'เครือข่าย', owner: 'Network Ops' },
    { code: 'MAIL', name: 'อีเมลองค์กร', fullName: 'บริการอีเมลองค์กร', health: 'DEGRADED', category: 'การทำงานร่วมกัน', owner: 'Messaging' },
    { code: 'M365', name: 'Microsoft 365', fullName: 'บริการ Microsoft 365', health: 'OK', category: 'การทำงานร่วมกัน', owner: 'Messaging' },
    { code: 'HR', name: 'ระบบ HR', fullName: 'บริการระบบ HR', health: 'OK', category: 'แอปพลิเคชันธุรกิจ', owner: 'HRIS Team' },
    { code: 'WEB', name: 'เว็บไซต์ลูกค้า', fullName: 'บริการเว็บไซต์ลูกค้า', health: 'OK', category: 'แอปพลิเคชันธุรกิจ', owner: 'Application Support' },
    { code: 'PRINT', name: 'งานพิมพ์', fullName: 'บริการงานพิมพ์', health: 'OK', category: 'อุปกรณ์ผู้ใช้', owner: 'Desktop Support' },
    { code: 'BI', name: 'Business Intelligence', fullName: 'บริการ Business Intelligence', health: 'OK', category: 'ข้อมูล', owner: 'Data Platform' },
    { code: 'ENDPOINT', name: 'คอมพิวเตอร์ผู้ใช้', fullName: 'บริการคอมพิวเตอร์ผู้ใช้', health: 'OK', category: 'อุปกรณ์ผู้ใช้', owner: 'Desktop Support' },
  ] as const;
  const svc: Record<string, string> = {};
  for (const [i, s] of svcDefs.entries()) {
    svc[s.code] = (
      await prisma.service.create({
        data: { code: s.code, name: s.name, fullName: s.fullName, health: s.health, category: s.category, ownerName: s.owner, sortOrder: i, slaId: sla.id },
      })
    ).id;
  }

  // ── CMDB (design/CMDB.dc.html) ──────────────────────────────────
  const ciDefs: any[] = [
    { ciId: 'CI-SVC-0003', name: 'ERP Production', subtitle: '340 ผู้ใช้ · SLA 99.5%', ciClass: 'BUSINESS_SERVICE', classLabel: 'Business Service', ownerLabel: 'ฝ่ายบัญชีและการเงิน', lifecycle: 'LIVE', attributes: { userCount: 340, slaTarget: '99.5%' } },
    { ciId: 'CI-SVC-0007', name: 'รายงานผู้บริหาร (BI)', subtitle: 'อ่านข้อมูลจาก ERP', ciClass: 'BUSINESS_SERVICE', classLabel: 'Business Service', ownerLabel: 'Data Platform', lifecycle: 'LIVE', attributes: { userCount: 120, slaTarget: '99.0%' } },
    { ciId: 'CI-APP-0041', name: 'ERP-APP-01', subtitle: 'App Server · Linux', ciClass: 'APPLICATION', classLabel: 'Application Server', ownerGroup: 'Application Support', lifecycle: 'LIVE', discovered: minutesAgo(14 * 60) },
    { ciId: 'CI-APP-0042', name: 'ERP-APP-02', subtitle: 'App Server · Linux', ciClass: 'APPLICATION', classLabel: 'Application Server', ownerGroup: 'Application Support', lifecycle: 'LIVE', discovered: minutesAgo(14 * 60), driftNote: 'RAM ในทะเบียน 128 GB ต่างจากที่ Discovery พบ 96 GB' },
    {
      ciId: 'CI-DB-00217', name: 'ERP-DB-02', subtitle: 'Oracle 19c · RAC node 2', ciClass: 'DATABASE', classLabel: 'Database', ownerGroup: 'DBA Team', ownerUser: somchai, lifecycle: 'LIVE',
      discovered: minutesAgo(14 * 60), verified: new Date('2026-09-18T03:00:00+07:00'),
      attributes: {
        'IP Address': '10.20.4.17', 'เวอร์ชัน': 'Oracle 19.21 (RU ม.ค. 2569)', 'เจ้าของ CI': 'DBA Team · สมชาย ก.',
        'เจ้าของบริการ': 'ฝ่ายบัญชีและการเงิน', 'ความสำคัญทางธุรกิจ': 'Tier 1 — สำคัญยิ่ง', 'ที่ตั้ง': 'Data Center 1 · Rack C-12',
        'ช่วงบำรุงรักษา': 'อา. 01:00–05:00 น.', 'แหล่งข้อมูล': 'Discovery + ยืนยันด้วยมือ',
        'ยืนยันล่าสุด': '18 ก.ย. 2569', 'สินทรัพย์ที่ผูก (ITAM)': 'ASSET-SRV-0891',
      },
    },
    { ciId: 'CI-DB-00216', name: 'ERP-DB-01', subtitle: 'Oracle 19c · RAC node 1', ciClass: 'DATABASE', classLabel: 'Database', ownerGroup: 'DBA Team', lifecycle: 'LIVE', discovered: minutesAgo(14 * 60) },
    { ciId: 'CI-NET-0388', name: 'FW-North-01', subtitle: 'Firewall · สาขาภาคเหนือ', ciClass: 'NETWORK_DEVICE', classLabel: 'Network Device', ownerGroup: 'Network Ops', lifecycle: 'MAINTENANCE', discovered: minutesAgo(14 * 60) },
    { ciId: 'CI-NET-0412', name: 'WAN-North-Link', subtitle: 'Network Link', ciClass: 'NETWORK_DEVICE', classLabel: 'Network Link', ownerGroup: 'Network Ops', lifecycle: 'LIVE', discovered: minutesAgo(14 * 60) },
    { ciId: 'CI-CLD-1120', name: 'hr-app-prod (AKS)', subtitle: 'Azure Kubernetes', ciClass: 'CLOUD_RESOURCE', classLabel: 'Cloud Resource', ownerGroup: 'HRIS Team', lifecycle: 'PLANNED', discovered: new Date('2026-10-01T22:00:00+07:00') },
    { ciId: 'CI-SRV-0207', name: 'ERP-REPORT-OLD', subtitle: 'Server', ciClass: 'SERVER', classLabel: 'Server', lifecycle: 'RETIRED', discovered: new Date('2026-06-14T03:00:00+07:00') },
    { ciId: 'CI-SRV-0301', name: 'VMH-DC1-07', subtitle: 'ESXi Host · DC1', ciClass: 'SERVER', classLabel: 'ESXi Host', ownerGroup: 'Data Platform', lifecycle: 'LIVE', discovered: minutesAgo(14 * 60) },
    { ciId: 'CI-SAN-0012', name: 'SAN-DC1-A', subtitle: 'Storage · 42 TB', ciClass: 'SERVER', classLabel: 'Storage', ownerGroup: 'Data Platform', lifecycle: 'LIVE', discovered: minutesAgo(14 * 60) },
    // Business Service ที่ยังไม่มี Service Model (6 รายการ — ตรงกับงาน data quality ในดีไซน์)
    ...[
      ['CI-SVC-0011', 'บริการอีเมลองค์กร', 'Messaging'], ['CI-SVC-0012', 'Remote Access / VPN', 'Network Ops'],
      ['CI-SVC-0013', 'Microsoft 365', 'Messaging'], ['CI-SVC-0014', 'ระบบ HR', 'HRIS Team'],
      ['CI-SVC-0015', 'เว็บไซต์ลูกค้า', 'Application Support'], ['CI-SVC-0016', 'บริการงานพิมพ์', 'Desktop Support'],
    ].map(([ciId, name, g]) => ({ ciId, name, subtitle: 'ยังไม่มี Service Model', ciClass: 'BUSINESS_SERVICE', classLabel: 'Business Service', ownerGroup: g, lifecycle: 'LIVE' })),
    { ciId: 'CI-APP-0050', name: 'M365 Tenant', subtitle: 'Microsoft 365 · SaaS', ciClass: 'APPLICATION', classLabel: 'SaaS Application', ownerGroup: 'Messaging', lifecycle: 'LIVE', discovered: minutesAgo(14 * 60) },
    { ciId: 'CI-NET-0501', name: 'SW-DC1-CORE01', subtitle: 'Core Switch · DC1', ciClass: 'NETWORK_DEVICE', classLabel: 'Network Device', ownerGroup: 'Network Ops', lifecycle: 'LIVE', discovered: minutesAgo(14 * 60), driftNote: 'เฟิร์มแวร์ในทะเบียน 9.3 ต่างจากที่ Discovery พบ 9.1' },
    { ciId: 'CI-CLD-1121', name: 'azure-vnet-prod', subtitle: 'Azure Virtual Network', ciClass: 'CLOUD_RESOURCE', classLabel: 'Cloud Resource', lifecycle: 'LIVE', discovered: minutesAgo(14 * 60) },
    { ciId: 'CI-EUD-1936', name: 'NB-FIN-0192', subtitle: 'โน้ตบุ๊ก · ฝ่ายการเงิน', ciClass: 'END_USER_DEVICE', classLabel: 'End-user Device', ownerGroup: 'Desktop Support', lifecycle: 'LIVE', discovered: minutesAgo(30 * 60) },
    { ciId: 'CI-EUD-1937', name: 'PC-NORTH-021', subtitle: 'เดสก์ท็อป · สาขาภาคเหนือ', ciClass: 'END_USER_DEVICE', classLabel: 'End-user Device', ownerGroup: 'Desktop Support', lifecycle: 'MAINTENANCE', discovered: minutesAgo(30 * 60) },
    { ciId: 'CI-EUD-1938', name: 'NB-HR-0044', subtitle: 'โน้ตบุ๊ก · ฝ่ายบุคคล', ciClass: 'END_USER_DEVICE', classLabel: 'End-user Device', lifecycle: 'LIVE', discovered: minutesAgo(120 * 24 * 60) },
    { ciId: 'CI-LIC-0100', name: 'Oracle DB Enterprise License', subtitle: 'ไลเซนส์ 16 core', ciClass: 'SOFTWARE_LICENSE', classLabel: 'Software License', ownerGroup: 'DBA Team', lifecycle: 'LIVE', verified: new Date('2026-08-15T10:00:00+07:00') },
    { ciId: 'CI-LIC-0101', name: 'Adobe Creative Cloud (50 seats)', subtitle: 'ไลเซนส์รายปี', ciClass: 'SOFTWARE_LICENSE', classLabel: 'Software License', ownerGroup: 'Desktop Support', lifecycle: 'LIVE', verified: new Date('2026-07-01T10:00:00+07:00') },
  ];
  const ci: Record<string, string> = {};
  for (const c of ciDefs) {
    ci[c.name] = (
      await prisma.configurationItem.create({
        data: {
          ciId: c.ciId, name: c.name, subtitle: c.subtitle, ciClass: c.ciClass, classLabel: c.classLabel, lifecycle: c.lifecycle,
          ownerLabel: c.ownerLabel, ownerGroupId: c.ownerGroup ? group[c.ownerGroup] : null, ownerUserId: c.ownerUser ?? null,
          attributes: c.attributes ?? {}, lastDiscoveredAt: c.discovered ?? null, lastVerifiedAt: c.verified ?? null, driftNote: c.driftNote ?? null,
        },
      })
    ).id;
  }
  const rel = (s: string, t: string, type: 'DEPENDS_ON' | 'RUNS_ON' | 'CONNECTS_TO' | 'HOSTS') =>
    prisma.cIRelationship.create({ data: { sourceId: ci[s], targetId: ci[t], type } });
  await rel('ERP Production', 'ERP-APP-01', 'DEPENDS_ON');
  await rel('ERP Production', 'ERP-APP-02', 'DEPENDS_ON');
  await rel('รายงานผู้บริหาร (BI)', 'ERP Production', 'DEPENDS_ON');
  await rel('ERP-APP-01', 'ERP-DB-02', 'DEPENDS_ON');
  await rel('ERP-APP-02', 'ERP-DB-02', 'DEPENDS_ON');
  await rel('ERP-APP-01', 'ERP-DB-01', 'DEPENDS_ON');
  await rel('ERP-APP-02', 'ERP-DB-01', 'DEPENDS_ON');
  await rel('ERP-DB-02', 'VMH-DC1-07', 'RUNS_ON');
  await rel('ERP-DB-02', 'SAN-DC1-A', 'DEPENDS_ON');
  await rel('ERP-APP-01', 'WAN-North-Link', 'CONNECTS_TO');
  await prisma.asset.create({ data: { assetTag: 'ASSET-SRV-0891', ciId: ci['ERP-DB-02'], vendor: 'Oracle / Dell', supportUntil: new Date('2027-03-31T00:00:00+07:00') } });
  const log = (name: string, daysAgo: number, what: string, source: string) =>
    prisma.cIChangeLog.create({ data: { ciId: ci[name], at: new Date(now.getTime() - daysAgo * 86_400_000), what, source } });
  await log('ERP-DB-02', 0, 'ปรับ processes 1500 → 2000 (รอ)', 'CHG-3381');
  await log('ERP-DB-02', 18, 'เพิ่ม RAM 256 → 384 GB', 'CHG-3288 · Discovery ยืนยัน');
  await log('ERP-DB-02', 254, 'อัปเดต Release Update 19.21', 'CHG-2950');
  await log('ERP-DB-02', 331, 'เปลี่ยนเจ้าของ CI เป็น DBA Team', 'แก้ไขโดย สมชาย ก.');
  await log('FW-North-01', 0, 'เปลี่ยนสถานะเป็นบำรุงรักษา', 'CHG-3376');
  await rel('M365 Tenant', 'azure-vnet-prod', 'CONNECTS_TO');
  await rel('VMH-DC1-07', 'SW-DC1-CORE01', 'CONNECTS_TO');

  // ── Problem / Knowledge ────────────────────────────────────────
  const prb412 = await prisma.problem.create({ data: { seq: 412, title: 'Connection pool ของ ERP เต็มช่วงปิดงวด', phase: 'CONTROL', workNote: 'มีวิธีแก้ชั่วคราว', workaround: 'รีสตาร์ท connection pool ของ ERP-DB-02 และจำกัดงานรายงานช่วงปิดงวด' } });
  const prb409 = await prisma.problem.create({ data: { seq: 409, title: 'ไคลเอนต์ VPN รุ่น 5.2 หลุดเมื่อสลับเครือข่าย', phase: 'KNOWN_ERROR', workNote: 'บันทึกใน KB-1187' } });
  const prb401 = await prisma.problem.create({ data: { seq: 401, title: 'คิว SMTP relay ล้นเมื่อส่งเกิน 2,000 ฉบับ/นาที', phase: 'ERROR_CONTROL', phaseLabel: 'รอ Change', workNote: 'ผูกกับ CHG-3376' } });
  const kbs: { seq: number; title: string; views: number; problemId?: string; body: string }[] = [
    {
      seq: 1187, title: 'VPN หลุดบ่อยเมื่อสลับ Wi-Fi — วิธีแก้ชั่วคราว', views: 1876, problemId: prb409.id,
      body: 'อาการ: ไคลเอนต์ VPN รุ่น 5.2 หลุดการเชื่อมต่อเมื่อสลับระหว่าง Wi-Fi กับเครือข่ายมือถือ\n\nวิธีแก้ชั่วคราว:\n1. ปิดการเชื่อมต่อ VPN แล้วเชื่อมต่อใหม่หลังสลับเครือข่ายเสร็จ\n2. ในการตั้งค่า VPN เปิด “Reconnect automatically”\n3. หากยังหลุดบ่อย ให้ติดตั้งไคลเอนต์รุ่น 5.1 จากพอร์ทัลซอฟต์แวร์\n\nสถานะ: เป็น Known Error (PRB-0409) ทีมเครือข่ายกำลังรอเวอร์ชันแก้ไขจากผู้ผลิต',
    },
    {
      seq: 1090, title: 'ตั้งค่า MFA บนโทรศัพท์เครื่องใหม่', views: 2410,
      body: 'ก่อนเริ่ม: ให้เครื่องเดิมยังใช้งานได้ หรือเตรียมรหัสสำรอง\n\n1. เปิดแอป Microsoft Authenticator บนเครื่องใหม่ แล้วเลือก “กู้คืนจากข้อมูลสำรอง”\n2. ลงชื่อเข้าใช้ด้วยบัญชีส่วนตัวที่ใช้สำรองข้อมูล\n3. ตรวจสอบว่าบัญชีที่ทำงานปรากฏในแอป แล้วทดสอบเข้าสู่ระบบ\n\nหากเครื่องเดิมหายหรือใช้ไม่ได้ ให้ขอรีเซ็ต MFA ผ่านรายการ “บัญชีผู้ใช้และรหัสผ่าน” ในแคตตาล็อกบริการ',
    },
    {
      seq: 1142, title: 'เชื่อมต่อเครื่องพิมพ์สำนักงานใหม่', views: 1302,
      body: '1. เชื่อมต่อเครือข่ายสำนักงาน (ไม่ใช่ Wi-Fi ผู้เยี่ยมชม)\n2. เปิด “การตั้งค่า › เครื่องพิมพ์และสแกนเนอร์ › เพิ่มอุปกรณ์”\n3. เลือกเครื่องพิมพ์ที่มีชื่อชั้นของคุณ เช่น PRN-F7-01\n4. พิมพ์หน้าทดสอบเพื่อยืนยัน\n\nหากไม่พบเครื่องพิมพ์ ให้แจ้งปัญหาพร้อมระบุชั้นและรหัสเครื่องที่ติดอยู่ด้านหน้าเครื่อง',
    },
    {
      seq: 1165, title: 'กู้คืนไฟล์ที่ลบจาก OneDrive', views: 988,
      body: 'ไฟล์ที่ลบจะอยู่ในถังขยะ 93 วัน\n\n1. เข้า OneDrive บนเว็บ แล้วเลือก “ถังรีไซเคิล”\n2. เลือกไฟล์ที่ต้องการ แล้วกด “กู้คืน”\n3. หากไม่พบ ให้เลือก “กู้คืน OneDrive ของคุณ” เพื่อย้อนสถานะไปยังเวลาที่ต้องการ (ภายใน 30 วัน)',
    },
  ];
  for (const k of kbs) await prisma.knowledgeArticle.create({ data: { ...k, status: 'PUBLISHED' } });

  // ── Change (design/Main.dc.html) ───────────────────────────────
  const mkChange = (seq: number, title: string, type: any, risk: any, start: Date, end: Date | null, extra: any = {}) =>
    prisma.change.create({ data: { seq, title, type, risk, windowStart: start, windowEnd: end, ...extra } });
  const chg3381 = await mkChange(3381, 'แพตช์ฐานข้อมูล ERP แก้ไข INC-24817', 'EMERGENCY', 'HIGH', bkk(0, '22:00'), bkk(0, '23:30'), {
    status: 'AWAITING_APPROVAL', cabApproval: 'ECAB', serviceId: svc.ERP, problemId: prb412.id,
    implementationPlan: 'แพตช์และปรับขนาด Connection pool ของ ERP-DB-02 (processes 1500 → 2000)', backoutPlan: 'คืนค่า parameter เดิมและรีสตาร์ท instance',
    cis: { create: [{ ciId: ci['ERP-DB-02'] }] },
  });
  await mkChange(3376, 'อัปเกรดเฟิร์มแวร์ไฟร์วอลล์สาขา', 'NORMAL', 'MED', bkk(2, '01:00'), bkk(2, '03:00'), {
    status: 'APPROVED', cabApproval: 'CAB', serviceId: svc.VPN, problemId: prb401.id, cis: { create: [{ ciId: ci['FW-North-01'] }] },
  });
  await mkChange(3370, 'เพิ่มผู้ใช้กลุ่มใหม่ใน M365', 'STANDARD', 'LOW', bkk(3, '10:00'), null, { status: 'SCHEDULED', serviceId: svc.M365 });
  await mkChange(3365, 'ย้ายระบบ HR ขึ้นคลาวด์ (เฟส 2)', 'NORMAL', 'HIGH', bkk(7, '20:00'), bkk(8, '02:00'), {
    status: 'AWAITING_APPROVAL', cabApproval: 'CAB', serviceId: svc.HR, cis: { create: [{ ciId: ci['hr-app-prod (AKS)'] }] },
  });

  // ── Incident ───────────────────────────────────────────────────
  type Inc = {
    seq: number; title: string; svc: string; group: string; impact: Level; urgency: Level; status: IncidentStatus;
    leftMin?: number; pct: number; assignee?: string; problemId?: string; major?: boolean; extra?: any;
  };
  const named: Inc[] = [
    { seq: 24817, title: 'ERP เข้าใช้งานไม่ได้ (สาขาภาคเหนือ)', svc: 'ERP', group: 'Application Support', impact: 'HIGH', urgency: 'HIGH', status: 'IN_PROGRESS', leftMin: 42, pct: 18, major: true, assignee: thanaphon, problemId: prb412.id },
    { seq: 24815, title: 'VPN ตัดการเชื่อมต่อเป็นระยะ', svc: 'VPN', group: 'Network Ops', impact: 'HIGH', urgency: 'MED', status: 'IN_PROGRESS', leftMin: 130, pct: 44 },
    { seq: 24809, title: 'อีเมลขาออกส่งล่าช้า', svc: 'MAIL', group: 'Messaging', impact: 'MED', urgency: 'HIGH', status: 'PENDING_VENDOR', leftMin: 215, pct: 61 },
    { seq: 24802, title: 'เครื่องพิมพ์ชั้น 7 พิมพ์ไม่ได้', svc: 'PRINT', group: 'Desktop Support', impact: 'MED', urgency: 'MED', status: 'ASSIGNED', leftMin: 380, pct: 72, assignee: me },
    { seq: 24796, title: 'Dashboard BI โหลดช้า', svc: 'BI', group: 'Data Platform', impact: 'MED', urgency: 'MED', status: 'PENDING_USER', leftMin: 545, pct: 80 },
    { seq: 24790, title: 'ไอคอนโปรแกรมหายจากเดสก์ท็อป', svc: 'ENDPOINT', group: 'Service Desk L1', impact: 'LOW', urgency: 'LOW', status: 'NEW', leftMin: 2880, pct: 92, assignee: me },
  ];

  // จำนวนเหตุที่เหลือต่อช่อง (Impact×Urgency) เพื่อให้เมทริกซ์ตรงดีไซน์ รวม 42
  const cellTotals: Record<string, number> = { 'HIGH-HIGH': 2, 'HIGH-MED': 3, 'HIGH-LOW': 1, 'MED-HIGH': 4, 'MED-MED': 9, 'MED-LOW': 5, 'LOW-HIGH': 6, 'LOW-MED': 7, 'LOW-LOW': 5 };
  for (const n of named) cellTotals[`${n.impact}-${n.urgency}`]--;
  const fillerCells = Object.entries(cellTotals).flatMap(([k, n]) => Array(n).fill(k) as string[]);

  const fillerTitles: [string, string, string][] = [
    ['ERP', 'Application Support', 'รายงานสรุปยอดขายใน ERP โหลดนานผิดปกติ'],
    ['VPN', 'Network Ops', 'เชื่อมต่อ VPN ไม่ได้เมื่อใช้เครือข่ายมือถือ'],
    ['MAIL', 'Messaging', 'อีเมลเข้ากล่องจดหมายกลางล่าช้า'],
    ['M365', 'Messaging', 'Teams แชร์หน้าจอไม่ได้'],
    ['HR', 'HRIS Team', 'ระบบลงเวลาแสดงข้อมูลไม่ครบ'],
    ['WEB', 'Application Support', 'หน้าชำระเงินเว็บไซต์ตอบสนองช้า'],
    ['PRINT', 'Desktop Support', 'เครื่องพิมพ์ชั้น 3 กระดาษติดบ่อย'],
    ['BI', 'Data Platform', 'ข้อมูลใน BI ไม่อัปเดตตามรอบ'],
    ['ENDPOINT', 'Service Desk L1', 'โน้ตบุ๊กเปิดไม่ติดหลังอัปเดต'],
    ['ERP', 'Application Support', 'ERP ออกใบแจ้งหนี้ซ้ำเมื่อกดบันทึกสองครั้ง'],
    ['VPN', 'Network Ops', 'VPN ช้ามากในช่วงบ่าย'],
    ['MAIL', 'Messaging', 'ปฏิทินประชุมไม่ซิงก์กับมือถือ'],
  ];
  const openStatuses: IncidentStatus[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'IN_PROGRESS', 'PENDING_USER', 'PENDING_VENDOR', 'ASSIGNED'];
  // ใกล้ผิด SLA 5 รายการ (รวม INC-24817) → 4 รายการจากเหตุอื่น; ที่เหลือคงเหลือ ≥ 30%
  // P1 ตัวที่สอง (i=0) เหลือเวลามากกว่า INC-24817 เพื่อให้ INC-24817 อยู่บนสุดของคิวเหมือนดีไซน์
  const fillerPct = [60, 12, 22, 9, 24, ...Array.from({ length: 31 }, (_, i) => 32 + ((i * 17) % 62))];
  const fillers: Inc[] = fillerCells.map((cell, i) => {
    const [impact, urgency] = cell.split('-') as [Level, Level];
    const [s, g, title] = fillerTitles[i % fillerTitles.length];
    const isOutlook = i === fillerCells.length - 1;
    return {
      seq: isOutlook ? 24811 : 24751 + i,
      title: isOutlook ? 'Outlook ไม่ซิงก์ปฏิทิน' : title,
      svc: isOutlook ? 'M365' : s, group: isOutlook ? 'Messaging' : g, impact, urgency,
      status: isOutlook ? 'PENDING_USER' : openStatuses[i % openStatuses.length],
      pct: fillerPct[i], assignee: i < 5 ? me : undefined,
      problemId: s === 'ERP' && i % 12 === 0 ? prb412.id : undefined,
      extra: isOutlook ? { reporterId: employee, category: 'อีเมลและการทำงานร่วมกัน' } : {},
    };
  });
  // ERP ที่ผูกกับ PRB-0412 ให้ครบ 5 รายการ (+ INC-24817 = 6)
  let erpLinked = fillers.filter((f) => f.problemId).length;
  for (const f of fillers) {
    if (erpLinked >= 5) break;
    if (f.svc === 'ERP' && !f.problemId) { f.problemId = prb412.id; erpLinked++; }
  }

  let major: { id: string } | null = null;
  for (const inc of [...named, ...fillers]) {
    const priority = calcPriority(inc.impact, inc.urgency);
    const target = inc.leftMin ? Math.round(inc.leftMin / (inc.pct / 100)) : TARGET[priority];
    const left = inc.leftMin ?? Math.round((inc.pct / 100) * target);
    const created = await prisma.incident.create({
      data: {
        seq: inc.seq, title: inc.title, impact: inc.impact, urgency: inc.urgency, priority, status: inc.status,
        lifecycleStep: inc.status === 'NEW' ? 1 : inc.status === 'ASSIGNED' ? 2 : inc.status === 'IN_PROGRESS' ? 3 : 3,
        isMajor: !!inc.major, serviceId: svc[inc.svc], groupId: group[inc.group], assigneeId: inc.assignee ?? null,
        problemId: inc.problemId ?? null, createdAt: minutesAgo(Math.max(5, target - left)),
        ...(inc.extra ?? {}),
        timers: {
          create: [{ metric: 'RESOLVE', targetMinutes: target, startedAt: minutesAhead(left - target), dueAt: minutesAhead(left), state: 'RUNNING' }],
        },
      },
    });
    if (inc.seq === 24817) major = created;
  }

  // Incident ที่ปิดแล้ว ผูกกับ Problem (VPN 14 รายการ, SMTP 3 รายการ)
  const closedBatch = async (count: number, startSeq: number, serviceCode: string, grp: string, title: string, problemId: string) => {
    for (let i = 0; i < count; i++) {
      await prisma.incident.create({
        data: {
          seq: startSeq + i, title, impact: 'MED', urgency: 'MED', priority: 'P3', status: 'CLOSED', lifecycleStep: 5,
          serviceId: svc[serviceCode], groupId: group[grp], problemId, createdAt: minutesAgo(60 * 24 * (3 + i)),
          resolvedAt: minutesAgo(60 * 24 * (2 + i)), closedAt: minutesAgo(60 * 24 * (2 + i)),
        },
      });
    }
  };
  await closedBatch(14, 24600, 'VPN', 'Network Ops', 'VPN หลุดเมื่อสลับ Wi-Fi', prb409.id);
  await closedBatch(3, 24650, 'MAIL', 'Messaging', 'อีเมลค้างคิว SMTP relay', prb401.id);

  // ── รายละเอียด INC-24817 (design/Incident.dc.html) ─────────────
  if (major) {
    await prisma.incident.update({
      where: { id: major.id },
      data: {
        description: 'ผู้ใช้สาขาภาคเหนือเข้า ERP ไม่ได้ ธุรกรรมหยุดชะงัก',
        category: 'แอปพลิเคชัน › การเข้าถึง', channel: 'Event / Monitoring', lifecycleStep: 3, managerId: wanna,
        changeId: chg3381.id,
        cis: {
          create: [
            { ciId: ci['ERP Production'], role: 'ได้รับผลกระทบ' },
            { ciId: ci['ERP-APP-01'], role: 'ขึ้นกับ ↓' },
            { ciId: ci['ERP-DB-02'], role: 'ต้นเหตุที่เป็นไปได้' },
            { ciId: ci['WAN-North-Link'], role: 'ปกติ' },
          ],
        },
        notes: {
          create: [
            { createdAt: minutesAgo(14), authorId: thanaphon, kind: 'การวินิจฉัย', tone: 'accent', body: 'พบ Connection pool ของ DB node 2 เต็ม 100% ตรงกับอาการใน PRB-0412 กำลังขออนุมัติ Emergency Change CHG-3381' },
            { createdAt: minutesAgo(25), authorId: wanna, kind: 'สื่อสารผู้ใช้', tone: 'ok', visibility: 'CUSTOMER', body: 'แจ้งผู้ใช้สาขาภาคเหนือผ่านหน้าสถานะบริการ: “ทีมกำลังแก้ไข คาดว่าจะอัปเดตภายใน 16:00 น.”' },
            { createdAt: minutesAgo(33), authorLabel: 'ระบบ', kind: 'ยกระดับ', tone: 'critical', body: 'ประกาศเป็น Major Incident เปิด Bridge call และแจ้งผู้บริหารตาม Communication plan' },
            { createdAt: minutesAgo(40), authorLabel: 'Service Desk L1', kind: 'จัดประเภท', tone: 'ink', body: 'ผลกระทบสูง × เร่งด่วนสูง = P1 · มอบหมาย Application Support' },
            { createdAt: minutesAgo(47), authorLabel: 'Monitoring', kind: 'Event', tone: 'muted', body: 'Alert: ERP-DB-02 response time > 5,000 ms (threshold 800 ms) สร้าง Incident อัตโนมัติ' },
          ],
        },
      },
    });
    await prisma.slaTimer.create({
      data: { incidentId: major.id, metric: 'RESPONSE', targetMinutes: 15, startedAt: minutesAgo(47), dueAt: minutesAgo(32), achievedAt: minutesAgo(43), state: 'MET' },
    });
  }

  // ── Service Request / แคตตาล็อก (design/Portal.dc.html) ─────────
  const cats = [
    ['อุปกรณ์และคอมพิวเตอร์', 'โน้ตบุ๊ก จอภาพ อุปกรณ์ต่อพ่วง', 'ส่งมอบภายใน 3 วันทำการ', 'ENDPOINT'],
    ['บัญชีผู้ใช้และรหัสผ่าน', 'รีเซ็ตรหัสผ่าน MFA บัญชีใหม่', 'อัตโนมัติ · ทันที', 'M365'],
    ['ซอฟต์แวร์และไลเซนส์', 'ติดตั้งโปรแกรม ต่ออายุไลเซนส์', 'ภายใน 1 วันทำการ', 'ENDPOINT'],
    ['เครือข่ายและ VPN', 'Wi-Fi ผู้เยี่ยมชม VPN พอร์ตเครือข่าย', 'ภายใน 1 วันทำการ', 'VPN'],
    ['อีเมลและการทำงานร่วมกัน', 'กล่องจดหมายกลาง Teams SharePoint', 'ภายใน 4 ชั่วโมงทำการ', 'M365'],
    ['พนักงานเข้าใหม่ / ลาออก', 'ชุดบริการ Onboarding / Offboarding', 'ล่วงหน้า 5 วันทำการ', 'HR'],
  ];
  const cat: string[] = [];
  for (const [i, c] of cats.entries()) {
    cat.push((await prisma.catalogItem.create({ data: { name: c[0], items: c[1], slaText: c[2], serviceId: svc[c[3]], sortOrder: i } })).id);
  }
  await prisma.serviceRequest.create({ data: { seq: 10291, title: 'ขอโน้ตบุ๊กใหม่ (เปลี่ยนเครื่องตามรอบ)', status: 'FULFILLING', stage: 3, nextNote: 'ส่ง → อนุมัติ → จัดเตรียม → ส่งมอบ · คาดว่าได้รับ 6 ต.ค.', catalogId: cat[0], requesterId: employee } });
  await prisma.serviceRequest.create({ data: { seq: 10233, title: 'ติดตั้งโปรแกรม Adobe Acrobat', status: 'DELIVERED', stage: 4, catalogId: cat[2], requesterId: employee, createdAt: minutesAgo(60 * 24 * 4), deliveredAt: minutesAgo(60 * 24) } });
  await prisma.serviceRequest.create({ data: { seq: 10288, title: 'ขอสิทธิ์โฟลเดอร์ฝ่ายการเงิน', status: 'PENDING_APPROVAL', stage: 1, nextNote: 'รอหัวหน้าฝ่ายการเงินอนุมัติ', catalogId: cat[2], requesterId: employee } });

  // ข้อความถึงผู้ใช้ใน INC-24811 (แสดงในพอร์ทัลเป็น “ทีม IT ขอข้อมูลเพิ่ม”)
  const outlook = await prisma.incident.findUnique({ where: { seq: 24811 } });
  if (outlook) {
    await prisma.incident.update({
      where: { id: outlook.id },
      data: {
        reporterId: employee, status: 'PENDING_USER',
        description: 'Outlook ไม่แสดงนัดหมายที่สร้างจากมือถือ ปฏิทินบนเดสก์ท็อปไม่อัปเดต',
        notes: { create: { authorId: me, kind: 'ขอข้อมูลเพิ่ม', tone: 'ok', visibility: 'CUSTOMER', body: 'ทีม IT ขอภาพหน้าจอข้อความผิดพลาด และแจ้งเวอร์ชันของ Outlook ที่ใช้อยู่' } },
      },
    });
  }

  // Incident ที่รอผู้ใช้ต้องหยุดตัวจับเวลา SLA (สอดคล้องกับกติกา PENDING_USER)
  await prisma.slaTimer.updateMany({
    where: { metric: 'RESOLVE', achievedAt: null, incident: { status: 'PENDING_USER' } },
    data: { pausedAt: now, state: 'PAUSED' },
  });

  // ── Continual Improvement ──────────────────────────────────────
  const imps: [string, number][] = [['ลด MTTR ของ P2 ลง 20% ด้วย Swarming', 5], ['Chatbot ตอบคำขอรีเซ็ตรหัสผ่านอัตโนมัติ', 3], ['รวม CMDB กับระบบสินทรัพย์ (ITAM)', 6]];
  for (const [i, [title, step]] of imps.entries()) await prisma.improvementItem.create({ data: { title, step, sortOrder: i } });

  // ── ตัวเลขรวมที่ดีไซน์ระบุแต่ไม่มีรายการรองรับ ──────────────────
  await prisma.dashboardSnapshot.create({
    data: {
      key: 'dashboard',
      data: {
        kpis: {
          requests: { value: '118', note: '▼ 9% จากสัปดาห์ก่อน', good: true },
          mttr: { value: '3.4 ชม.', note: '▼ ดีขึ้น 0.6 ชม.', good: true },
          sla: { value: '96.2%', note: 'เป้าหมาย 95%', good: true },
          changeSuccess: { value: '98.1%', note: 'ล้มเหลว 1 จาก 53', good: true },
          csat: { value: '4.6/5', note: 'จาก 812 แบบประเมิน', good: true },
        },
        chain: ['4', '6', '1,284', '14', '3,912', '160'],
        slaByService: [
          { name: 'ERP', pct: 91.4 }, { name: 'Remote Access', pct: 94.2 }, { name: 'อีเมลองค์กร', pct: 97.8 },
          { name: 'Microsoft 365', pct: 99.1 }, { name: 'ระบบ HR', pct: 98.5 },
        ],
        navBadges: { serviceDesk: '12', request: '118', problem: '9', change: '14', release: '3', improvement: '6' },
      },
    },
  });

  // เลื่อน sequence ให้ต่อจากเลขสูงสุดที่ seed ไว้
  for (const t of ['Incident', 'ServiceRequest', 'Problem', 'Change', 'KnowledgeArticle']) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${t}"', 'seq'), (SELECT COALESCE(MAX(seq), 1) FROM "${t}"))`,
    );
  }

  const open = await prisma.incident.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } });
  console.log(`seed เสร็จ · Incident เปิดอยู่ ${open} รายการ`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
