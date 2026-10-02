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

ความคืบหน้า: เฟส 1–7 เสร็จ — แดชบอร์ด, Incident, CMDB, Portal, Problem, Change (ปฏิทิน + CAB/ECAB), Knowledge, SLA reports และคิว Service Request

## ผู้ใช้ตัวอย่างและสิทธิ์ (ยังไม่มี Auth)
เมนูล่างสุดของ sidebar มีตัวสลับผู้ใช้เจ้าหน้าที่ (คุกกี้ `demo_user`) ใช้ทดสอบสิทธิ์ตามบทบาท — ปิดได้ด้วย `DEMO_USER_SWITCH=off`

| ผู้ใช้ | บทบาท | ทำอะไรได้เพิ่ม |
|---|---|---|
| somsak@ | AGENT | จัดการ Problem/Incident/KB (ร่าง), สร้าง Change, จัดเตรียมคำขอ |
| wanna@ | RESOLVER_GROUP_LEAD | + เผยแพร่ KB, อนุมัติคำขอ, ดำเนินการ Change |
| change@ | CHANGE_MANAGER | + จัดตาราง/ดำเนินการ/ปิด Change |
| cab@, cab2@, cab3@ | CAB_MEMBER | อนุมัติ/ไม่อนุมัติ Change ที่ส่งเข้า CAB/ECAB |
| admin@ | ADMIN | ทุกอย่าง |

ผู้ใช้ปลายทางพอร์ทัลคือ `employee@servicehub.local` (ไม่อยู่ในตัวสลับ) — โดเมนอีเมลทั้งหมด `@servicehub.local`
