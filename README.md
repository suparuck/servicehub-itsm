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
