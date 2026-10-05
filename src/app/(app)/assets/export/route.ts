import { NextResponse } from 'next/server';
import { expiringWindow, toCsv, licenseState, supportState } from '@/lib/asset';
import { getAssetAlertDays } from '@/lib/settingsService';
import { assetsForExport } from '@/lib/assetService';
import { bangkokYmd } from '@/lib/change';
import { getCurrentUser } from '@/lib/currentUser';
import { th } from '@/i18n/th';

export const dynamic = 'force-dynamic';

/** ทะเบียนสินทรัพย์เป็น CSV (ตรวจนับ/ตรวจสอบ) — ใช้ตัวกรองเดียวกับหน้ารายการ · เฉพาะเจ้าหน้าที่ (ผู้ใช้ปลายทางถูก middleware กั้นไว้แล้ว ตรวจซ้ำที่นี่) */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (user.role === 'END_USER') return new NextResponse(null, { status: 403 });
  const p = new URL(req.url).searchParams;
  const rows = await assetsForExport({ q: p.get('q') ?? undefined, cls: p.get('cls') ?? undefined, status: p.get('status') ?? undefined, support: p.get('support') ?? undefined });
  const now = new Date();
  const windowDays = expiringWindow(await getAssetAlertDays());
  const d = (x: Date | null) => (x ? bangkokYmd(x) : '');
  const t = th.asset;
  const header = ['แท็ก', 'CI', 'ชื่อ', 'ประเภท', 'สถานะ', 'ผู้ถือครอง', 'สถานที่', 'ผู้ขาย', 'Serial', 'มูลค่า (บาท)', 'วันที่ซื้อ', 'สิ้นสุดประกัน/ไลเซนส์', 'สถานะประกัน', 'สิทธิ์ที่ซื้อ', 'สิทธิ์ที่ใช้', 'สถานะไลเซนส์'];
  const body = rows.map((r) => [
    r.assetTag, r.ci.ciId, r.ci.name, t.classes[r.ci.ciClass as keyof typeof t.classes] ?? r.ci.ciClass, t.status[r.status], r.assignedTo?.name ?? '', r.location ?? '', r.vendor ?? '', r.serialNo ?? '',
    r.costBaht ?? '', d(r.purchasedAt), d(r.supportUntil), r.status === 'RETIRED' ? '' : t.support[supportState(r.supportUntil, now, windowDays)], r.licenseQty ?? '', r.licenseUsed ?? '', r.ci.ciClass === 'SOFTWARE_LICENSE' ? t.license[licenseState(r.licenseQty, r.licenseUsed)] : '',
  ]);
  return new NextResponse(toCsv([header, ...body]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="servicehub-assets-${bangkokYmd(now)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
