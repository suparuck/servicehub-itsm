# ServiceHub — แพ็กเกจส่งต่องานออกแบบให้ Claude Code

## เริ่มใช้งาน
1. แตกไฟล์นี้ไว้ในโฟลเดอร์ที่จะใช้เป็นโปรเจกต์ เช่น `C:\Projects\servicehub`
2. เปิด Terminal ในโฟลเดอร์นั้น แล้วรัน `claude`
   (หรือเปิดโฟลเดอร์นี้ในแท็บ Code ของแอป Claude desktop)
3. Claude Code จะอ่าน `CLAUDE.md` อัตโนมัติ — คัดลอกข้อความด้านล่างไปวางเป็นข้อความแรก

```
อ่าน CLAUDE.md และไฟล์ทั้งหมดใน design/ แล้วเริ่มเฟส 1–3:
scaffold โปรเจกต์ Next.js + TypeScript + Tailwind + Prisma, ตั้ง design tokens,
สร้าง layout พร้อม sidebar, สร้าง Prisma schema + seed จาก mock data
และสร้างหน้าแดชบอร์ด / ให้ตรงกับ design/Main.dc.html
วางแผนให้ฉันดูก่อนลงมือ แล้วรัน dev server ให้ตรวจผลได้
```

## สิ่งที่อยู่ในแพ็กเกจ
- `CLAUDE.md` — บรีฟโปรเจกต์: stack, design tokens, โมเดลข้อมูล ITIL 4, ลำดับการพัฒนา
- `design/` — ไฟล์ออกแบบต้นฉบับ 4 หน้า (แดชบอร์ด, Incident, พอร์ทัล, CMDB)

## รันโปรเจกต์ด้วย Docker
```bash
docker compose up --build
```
เปิด http://localhost:3000 — คอนเทนเนอร์ `web` จะรัน `prisma migrate deploy` + seed จาก mock data แล้วเริ่ม `next dev`
(Postgres 16 อยู่ที่พอร์ต 5432, ผู้ใช้/รหัส/ฐานข้อมูล `servicehub`)

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `docker compose exec web npx prisma db seed` | seed ข้อมูลตัวอย่างใหม่ (ล้างข้อมูลเดิม) |
| `docker compose exec web npx vitest run` | รัน unit test |
| `docker compose down -v` | หยุดและลบข้อมูลฐานข้อมูล |

ความคืบหน้า: เฟส 1–7 เสร็จ + Auth (Auth.js) + E2E (Playwright 93 เคส) — แดชบอร์ด, Incident, CMDB, Portal, Problem, Change (ปฏิทิน + CAB/ECAB), Knowledge, SLA reports และคิว Service Request

## การยืนยันตัวตน (Auth.js) และสิทธิ์
- ทุกหน้าต้องล็อกอิน (middleware) — ไปที่ http://localhost:3000 แล้วระบบพาไป `/login`; ผู้ใช้ปลายทาง (`END_USER`) เข้าได้เฉพาะ `/portal`
- Session เป็น JWT อายุ 8 ชม. · รหัสผ่านเก็บแบบ bcrypt · ผิดเกิน 5 ครั้ง/บัญชี (หรือ 30 ครั้ง/ไอพี) ล็อกชั่วคราว 15 นาที
- สิทธิ์ตามบทบาทบังคับในฝั่ง service ทุกครั้งที่แก้ข้อมูล (`src/lib/permissions.ts`) — การซ่อนปุ่มใน UI เป็นแค่ความสะดวก
- **Microsoft Entra ID (Azure AD)**: กำหนด `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER` (ดู `.env.example`) จะมีปุ่ม "เข้าสู่ระบบด้วย Microsoft" — รับเฉพาะผู้ใช้ที่มีอยู่ในระบบแล้ว (จับคู่ด้วยอีเมล) ไม่สร้างบัญชีอัตโนมัติ
- **production**: ต้องตั้ง `AUTH_SECRET` (`openssl rand -base64 32`) และ `SEED_PASSWORD` เอง; ค่าใน `docker-compose.yml` ใช้เพื่อพัฒนาเท่านั้น และการจำกัดการล็อกอินเก็บในหน่วยความจำของเซิร์ฟเวอร์เดียว (หลายเครื่องต้องย้ายไป Redis)

### บัญชีตัวอย่าง (ใช้เพื่อพัฒนาเท่านั้น)
รหัสผ่านทุกบัญชีคือค่า `SEED_PASSWORD` (ใน `docker-compose.yml` ตั้งไว้ `servicehub-demo`) · ลงชื่อเข้าใช้ที่ `/login` ด้วยอีเมลด้านล่าง

| อีเมล | บทบาท | ทำอะไรได้เพิ่ม |
|---|---|---|
| somsak@servicehub.local | AGENT | จัดการ Problem/Incident/KB (ร่าง), สร้าง Change, จัดเตรียมคำขอ |
| wanna@servicehub.local | RESOLVER_GROUP_LEAD | + เผยแพร่ KB, อนุมัติคำขอ, ดำเนินการ Change |
| change@servicehub.local | CHANGE_MANAGER | + จัดตาราง/ดำเนินการ/ปิด Change |
| cab@ / cab2@ / cab3@servicehub.local | CAB_MEMBER | อนุมัติ/ไม่อนุมัติ Change ที่ส่งเข้า CAB/ECAB |
| admin@servicehub.local | ADMIN | ทุกอย่าง |
| employee@servicehub.local | END_USER | พอร์ทัลผู้ใช้ (แจ้งปัญหา ขอบริการ ติดตาม ประเมิน) |

## ทดสอบ
| คำสั่ง | ทำอะไร |
|---|---|
| `npm test` | unit test (Vitest) — logic ล้วน ไม่ต้องใช้ DB |
| `npm run test:e2e` | E2E (Playwright) กับแอปที่รันอยู่ที่ localhost:3000 — **ล้างและ seed ฐานข้อมูลใหม่ก่อนรันทุกครั้ง** (ผ่าน `docker compose exec`) |
| `E2E_RESET=0 npm run test:e2e` | รันโดยไม่ reset ฐานข้อมูล |
| `E2E_BROWSER=chrome npm run test:e2e` | เลือกเบราว์เซอร์: `msedge` (ค่าเริ่มต้น) · `chrome` · `chromium` (ต้อง `npx playwright install chromium`) |
| `npm run test:e2e:report` | เปิดรายงาน HTML ของการรันล่าสุด |

ไฟล์ E2E เรียงตามเลขนำหน้า (`tests/e2e/01-…`) เพราะแชร์ฐานข้อมูลเดียวกันและมีการแก้ข้อมูลระหว่างทดสอบ
