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

ความคืบหน้า: เฟส 1–7 เสร็จ + Auth (Auth.js) + E2E (Playwright 110 เคส) + CI (GitHub Actions) + จัดการผู้ใช้/เปลี่ยนรหัสผ่าน — แดชบอร์ด, Incident, CMDB, Portal, Problem, Change (ปฏิทิน + CAB/ECAB), Knowledge, SLA reports และคิว Service Request

## การยืนยันตัวตน (Auth.js) และสิทธิ์
- ทุกหน้าต้องล็อกอิน (middleware) — ไปที่ http://localhost:3000 แล้วระบบพาไป `/login`; ผู้ใช้ปลายทาง (`END_USER`) เข้าได้เฉพาะ `/portal`
- Session เป็น JWT อายุ 8 ชม. · รหัสผ่านเก็บแบบ bcrypt · ผิดเกิน 5 ครั้ง/บัญชี (หรือ 30 ครั้ง/ไอพี) ล็อกชั่วคราว 15 นาที
- สิทธิ์ตามบทบาทบังคับในฝั่ง service ทุกครั้งที่แก้ข้อมูล (`src/lib/permissions.ts`) — การซ่อนปุ่มใน UI เป็นแค่ความสะดวก
- **Microsoft Entra ID (Azure AD)**: กำหนด `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER` (ดู `.env.example`) จะมีปุ่ม "เข้าสู่ระบบด้วย Microsoft" — รับเฉพาะผู้ใช้ที่มีอยู่ในระบบแล้ว (จับคู่ด้วยอีเมล) ไม่สร้างบัญชีอัตโนมัติ
- **หลัง reverse proxy**: ตั้ง `AUTH_URL=https://โดเมนของคุณ` เพื่อให้ redirect (เช่น เด้งไปหน้า login) ชี้โดเมนสาธารณะ — ใน production ฝั่ง standalone `request.url` เป็นโฮสต์ภายในของเซิร์ฟเวอร์ ไม่ใช่โดเมนที่ผู้ใช้เห็น (ถ้าไม่ตั้ง จะใช้ `X-Forwarded-Proto/Host` แล้วถอยไป `Host`)
- session ไม่ถูกต่ออายุเองทุกคำขอ (middleware อ่าน token อย่างเดียว) — หมดอายุ 8 ชม. หลังล็อกอิน แล้วต้องเข้าใหม่; ทำแบบนี้เพราะการต่ออายุทุกคำขอทำให้ "ออกจากระบบ" ไม่สำเร็จเมื่อมี prefetch ค้างอยู่
- **production**: ต้องตั้ง `AUTH_SECRET` (`openssl rand -base64 32`) และ `SEED_PASSWORD` เอง; ค่าใน `docker-compose.yml` ใช้เพื่อพัฒนาเท่านั้น และการจำกัดการล็อกอินเก็บในหน่วยความจำของเซิร์ฟเวอร์เดียว (หลายเครื่องต้องย้ายไป Redis)

### จัดการผู้ใช้และรหัสผ่าน
- **เปลี่ยนรหัสผ่านเอง** — เมนู "บัญชีของฉัน" (`/account`) ต้องใส่รหัสเดิม · นโยบาย: ยาว ≥ 10 ตัว, มี ≥ 3 ชนิดอักขระ, ไม่เดาง่าย, ไม่มีส่วนของอีเมล, ไม่ซ้ำเดิม · ใส่รหัสเดิมผิด 5 ครั้งถูกล็อกชั่วคราว · เปลี่ยนสำเร็จแล้วระบบออกจากระบบ **ทุกอุปกรณ์** (session เก่าใช้ไม่ได้)
- **ผู้ดูแลระบบ (`ADMIN`)** — เมนู "ผู้ใช้และสิทธิ์" (`/admin/users`): สร้างผู้ใช้ แก้ชื่อ/บทบาท/กลุ่ม ปิด-เปิดบัญชี และ **รีเซ็ตรหัสผ่าน**
  - รหัสผ่านชั่วคราวสุ่ม 16 ตัว **แสดงครั้งเดียว** ในหน้าที่สร้าง/รีเซ็ต (ไม่เก็บเป็นข้อความธรรมดา ไม่อยู่ใน URL) — ผู้ใช้ถูกบังคับเปลี่ยนรหัสก่อนใช้งานอื่นทั้งหมด
  - การปิดบัญชี/รีเซ็ตรหัสผ่านมีผลทันที (session เดิมของผู้ใช้ถูกปฏิเสธ)
  - กันเหตุเผลอ: ปิดบัญชีหรือลดบทบาทตัวเองไม่ได้ และต้องเหลือ ADMIN ที่ใช้งานอยู่อย่างน้อย 1 คน
  - ผู้ใช้ที่เข้าผ่าน Microsoft เท่านั้น: ติ๊ก "ล็อกอินผ่าน Microsoft เท่านั้น" ตอนสร้าง (ไม่ตั้งรหัสผ่าน)
  - ทุกการเปลี่ยนแปลงบันทึกในประวัติกิจกรรมของผู้ใช้นั้น

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

## CI (GitHub Actions)
ไฟล์ `.github/workflows/ci.yml` รันทุก push เข้า `main` และทุก Pull Request (ยกเลิกการรันเก่าของ branch เดียวกันเมื่อมี push ใหม่) ประกอบด้วย 3 job ขนานกัน:

| Job | ทำอะไร | เวลาโดยประมาณ |
|---|---|---|
| **Typecheck · Lint · Unit** | `tsc --noEmit` → `next lint` → `vitest run` | ~2 นาที |
| **E2E (Playwright)** | PostgreSQL 16 → migrate จากฐานว่าง + seed → `next build` → เซิร์ฟเวอร์ standalone → Playwright (Chromium) ทุกเคส | ~10–15 นาที |
| **Production image** | `docker build` ด้วย `Dockerfile` จริง + เปิดคอนเทนเนอร์แล้วเช็ก `/login` ตอบ 200 | ~3 นาที |

- E2E รันกับ **build production** (ไม่ใช่ dev server) เพื่อให้ตรงกับของที่ปล่อยจริงและเสถียรกว่า; เกิดล้มเหลวจะ retry 1 ครั้ง และเก็บ **รายงาน HTML / trace / screenshot** เป็น artifact (เก็บ 7 วัน) ดาวน์โหลดจากหน้า run
- `AUTH_SECRET` สุ่มใหม่ทุกครั้งและถูกซ่อนใน log · รหัสผ่านบัญชีตัวอย่างใน CI คือค่าตั้งต้นของ seed (ฐานข้อมูลชั่วคราวที่ถูกทิ้งหลังจบ job)
- ขั้นตอน E2E ทั้งหมดอยู่ใน `scripts/ci-e2e.sh` — **รันซ้ำในเครื่องได้เหมือนบน CI** (ต้องมี PostgreSQL ว่างสักตัว; สคริปต์จะล้างและ seed ฐานข้อมูลนั้น):
  ```bash
  docker run -d --name sh-ci-pg -e POSTGRES_USER=servicehub -e POSTGRES_PASSWORD=servicehub -e POSTGRES_DB=servicehub -p 55432:5432 postgres:16-alpine
  CI=true PORT=3100 E2E_BROWSER=chromium \
    DATABASE_URL="postgresql://servicehub:servicehub@127.0.0.1:55432/servicehub?schema=public" \
    AUTH_SECRET="$(openssl rand -base64 32)" bash scripts/ci-e2e.sh
  ```
- ตั้ง branch protection ให้ทั้ง 3 job เป็น required check ได้ที่ Settings → Branches (ชื่อ check: `Typecheck · Lint · Unit`, `E2E (Playwright)`, `Production image`)
- เทสต์ไม่ผูกกับวันที่จริง (ชื่อเดือนในปฏิทินคำนวณจากเวลาปัจจุบัน และ seed สร้างวันที่สัมพัทธ์กับตอน seed) จึงรันได้ทุกวัน
