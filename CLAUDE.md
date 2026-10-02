# ServiceHub — ระบบบริหารจัดการบริการ IT (ITSM) ตามแนวทาง ITIL 4

ไฟล์นี้คือบรีฟของโปรเจกต์สำหรับ Claude Code อ่านทั้งไฟล์ก่อนเริ่มงานทุกครั้ง

## เป้าหมาย
สร้างเว็บแอป ITSM ภาษาไทย (ศัพท์ ITIL ใช้ภาษาอังกฤษควบคู่) ให้หน้าตาและพฤติกรรมตรงกับงานออกแบบในโฟลเดอร์ `design/`
และใช้โครงสร้างข้อมูล/เวิร์กโฟลว์ตามแนวปฏิบัติ (practices) ของ ITIL 4

## แหล่งอ้างอิงการออกแบบ (`design/`)
| ไฟล์ | หน้า | Route ที่ต้องสร้าง |
|---|---|---|
| `Main.dc.html` | แดชบอร์ดภาพรวม (Service Value Chain) | `/` |
| `Incident.dc.html` | รายละเอียด Incident | `/incidents/[id]` (+ รายการ `/incidents`) |
| `Portal.dc.html` | พอร์ทัลบริการตนเองของผู้ใช้ | `/portal` |
| `CMDB.dc.html` | CMDB / Service Configuration Management | `/cmdb` และ `/cmdb/[id]` |

วิธีอ่านไฟล์ `.dc.html` (เป็นฟอร์แมตของเครื่องมือออกแบบ ไม่ใช่ HTML ที่รันได้ตรง ๆ):
- markup ระหว่าง `<x-dc>…</x-dc>` คือเลย์เอาต์ — inline style คือค่าดีไซน์ที่ต้องยึดตาม (สี ระยะ ขนาดตัวอักษร รัศมีมุม)
- `<helmet><style>` มี breakpoint สำหรับ responsive — ต้องคงพฤติกรรมนี้ไว้
- `{{name}}` คือค่าที่มาจาก `renderVals()` ในแท็ก `<script type="text/x-dc">` ท้ายไฟล์
- `<sc-for list="{{x}}" as="it">` = วนลูป, `<sc-if value="{{c}}">` = เงื่อนไข
- ข้อมูลใน `renderVals()` คือ **mock data** — ย้ายไปเป็น seed data ของฐานข้อมูล ไม่ใช่ hard-code ในคอมโพเนนต์
- `canvas.json` แค่จัดวางอาร์ตบอร์ด ไม่ต้องใช้

## Stack ที่แนะนำ (ปรับได้ถ้าผู้ใช้กำหนดอย่างอื่น)
- Next.js (App Router) + TypeScript + Tailwind CSS
- PostgreSQL + Prisma ORM, seed ด้วยข้อมูลจาก mock
- Auth: NextAuth/Auth.js (รองรับ Azure AD / Entra ID ภายหลัง) — บทบาท: `END_USER`, `AGENT`, `RESOLVER_GROUP_LEAD`, `CHANGE_MANAGER`, `CAB_MEMBER`, `CONFIG_MANAGER`, `ADMIN`
- ทดสอบ: Vitest (logic) + Playwright (หน้าหลัก)

## Design tokens (ดึงจากงานออกแบบ)
```
ฟอนต์:   IBM Plex Sans Thai (400/500/600/700), IBM Plex Mono สำหรับเลขที่/ตัวเลข
พื้น:     page #EEF0EC · surface #FFFFFF · subtle #F7F8F5 · sidebar #16191D
ข้อความ:  ink #16191D · muted #5B6170
เส้น:     border #DADDD6 · input #C9CDC4 · divider #EEF0EC
accent:   #1F4FD8 (hover #163A9E, tint #E3E9FC)
สถานะ:   ok #0F766E/#0B5A54 tint #E1F2EF · warn #C2410C/#8A3A06 tint #FDEFD9 · critical #B42318/#9A1C12 tint #FDE8E6 · neutral #3D434C tint #ECEEEA
ลำดับความสำคัญ: P1 critical · P2 warn · P3 accent · P4 neutral (ต้องมีข้อความกำกับเสมอ ห้ามใช้สีอย่างเดียว)
รัศมี:    card 10px · control 8px · chip 12px
```
กติกา: ปุ่ม/ลิงก์สูงอย่างน้อย 44px, ใช้ `<button>`/`<a>`/`<label>` จริง, คอนทราสต์ข้อความ ≥ 4.5:1, ใช้งานได้ที่ความกว้างมือถือ

## โมเดลข้อมูลหลัก (ตาม ITIL 4 practices)
- **Service / ServiceOffering** (Service Catalogue Management) — ชื่อ, เจ้าของ, SLA ที่ผูก, หมวดหมู่
- **ConfigurationItem** (Service Configuration Management) — `ciId`, ชื่อ, คลาส (BusinessService, Application, Server, Database, NetworkDevice, CloudResource, EndUserDevice, SoftwareLicense), environment, lifecycle (PLANNED/LIVE/MAINTENANCE/RETIRED), owner, attributes (JSON), lastDiscoveredAt, lastVerifiedAt
- **CIRelationship** — source, target, type (DEPENDS_ON, RUNS_ON, CONNECTS_TO, HOSTS) → ใช้ทำ Service Model และ Impact Analysis (ไล่กราฟขึ้นไปหา Business Service)
- **Incident** — `INC-#####`, impact (HIGH/MED/LOW), urgency (HIGH/MED/LOW), priority คำนวณจากเมทริกซ์, status (NEW, ASSIGNED, IN_PROGRESS, PENDING_USER, PENDING_VENDOR, RESOLVED, CLOSED), lifecycle step, service, CIs, assignment group, assignee, isMajor, parent/child, work notes (internal/customer-visible)
- **ServiceRequest** (Service Request Management) — `REQ-#####`, catalog item, approval steps, fulfilment tasks, สถานะ ส่ง → อนุมัติ → จัดเตรียม → ส่งมอบ
- **Problem** (Problem Management) — `PRB-####`, phase (IDENTIFICATION, CONTROL, ERROR_CONTROL, KNOWN_ERROR, RESOLVED), workaround, root cause, linked incidents
- **Change** (Change Enablement) — `CHG-####`, type (STANDARD/NORMAL/EMERGENCY), risk, schedule window, CAB/ECAB approval, affected CIs, implementation/backout plan, ผลลัพธ์
- **KnowledgeArticle** — `KB-####`, สถานะร่าง/เผยแพร่, ยอดเข้าชม, ผูกกับ Problem/Known Error
- **SLA / SLATarget / SLATimer** (Service Level Management) — response/resolve target ตาม priority + ปฏิทินเวลาทำการ, pause เมื่อ PENDING_USER
- **ImprovementItem** (Continual Improvement) — ขั้นตอน 1–7 ของโมเดลปรับปรุง
- **Asset** (IT Asset Management) — ผูก 1:1 กับ CI ที่เป็นฮาร์ดแวร์/ไลเซนส์
- **SurveyResponse** — CSAT 1–5 หลังปิดงาน

เมทริกซ์ priority (Impact × Urgency):
```
            Urgency HIGH  MED  LOW
Impact HIGH        P1    P2   P3
       MED         P2    P3   P4
       LOW         P3    P4   P4
```

## ลำดับการพัฒนา (ทำทีละเฟส ให้รันได้ทุกเฟส)
1. Scaffold โปรเจกต์ + design tokens ใน Tailwind config + layout (sidebar จัดกลุ่มตาม Service Value Chain: Plan, Improve, Engage, Design & Transition, Obtain/Build, Deliver & Support)
2. Prisma schema + seed จาก mock data ใน `design/*.dc.html`
3. หน้าแดชบอร์ด `/` (KPI, value chain, คิว Incident, priority matrix, changes, problems, service status, SLA, improvement register)
4. Incident: รายการ + รายละเอียด + สร้าง/แก้ไข, คำนวณ priority, SLA timer, work notes
5. CMDB: รายการ + ตัวกรอง + รายละเอียด CI + แผนผังความสัมพันธ์ + impact analysis + งาน data quality
6. Portal ผู้ใช้: ค้นหา, แคตตาล็อก, แจ้งปัญหา/ขอบริการ, ติดตามรายการ, CSAT
7. Problem, Change (ปฏิทิน + การอนุมัติ CAB), Knowledge, SLA reports

## ข้อตกลงในการทำงาน
- UI text ภาษาไทยทั้งหมด เก็บไว้ในไฟล์ข้อความกลาง (เตรียม i18n)
- วันที่แสดงแบบไทย (พ.ศ.) แต่เก็บใน DB เป็น UTC, timezone Asia/Bangkok
- เลขที่เอกสารรันต่อเนื่องด้วย sequence ใน DB
- คอมโพเนนต์ที่ใช้ซ้ำ: `PriorityChip`, `StatusBadge`, `SlaBar`, `KpiTile`, `Card`, `DataTable`, `CiNode`
- อย่าแก้ไฟล์ใน `design/` — เป็นต้นฉบับอ้างอิง
