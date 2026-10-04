import { NextResponse } from 'next/server';
import { buildEvents, toIcs } from '@/lib/calendar';
import { loadCalendarRows, exportRange } from '@/lib/calendarQueries';
import { getCurrentUser } from '@/lib/currentUser';
import { appUrl } from '@/lib/mail/config';

export const dynamic = 'force-dynamic';

/** ดาวน์โหลดปฏิทิน Change & Problem เป็น .ics — ต้องล็อกอิน (ผู้ใช้ปลายทางถูก middleware กั้นไว้แล้ว ตรวจซ้ำที่นี่) */
export async function GET() {
  const user = await getCurrentUser();
  if (user.role === 'END_USER') return new NextResponse(null, { status: 403 });
  const { from, to } = exportRange();
  const rows = await loadCalendarRows(from, to);
  // ตัดส่วนที่ขยายเกินช่วงออก (ใช้เฉพาะตอนตรวจชน)
  const events = buildEvents(rows.changes, rows.problems).filter((e) => e.start >= from && e.start < to);
  return new NextResponse(toIcs(events, appUrl()), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="servicehub-change-problem.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
