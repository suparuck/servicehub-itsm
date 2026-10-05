import { NextResponse } from 'next/server';
import { ingestEvent, authenticateSource } from '@/lib/monitoringService';
import { MAX_BODY_BYTES, RATE_WINDOW_MS, allowRate, bearer, looksLikeSourceToken, parseEvent } from '@/lib/monitoring';
import { MAX_FAILURES_PER_IP, isLocked, recordFailure } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const buckets = new Map<string, { n: number; start: number }>();

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

function clientIp(req: Request) {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim();
}

/**
 * รับเหตุการณ์จากระบบมอนิเตอร์ภายนอก (webhook)
 *   POST /api/monitoring/events   Authorization: Bearer shm_...   Content-Type: application/json
 *   { "check": "disk_full", "severity": "critical", "ci": "ERP-DB-02", "service": "ERP", "message": "...", "key": "/data" }
 * severity = ok | info | warning | critical (ok = กลับสู่ปกติ) · ตอบ 202 เมื่อรับแล้ว
 * token ส่งทางหัว Authorization เท่านั้น (ไม่รับทาง URL เพราะถูกบันทึกใน log)
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  // กัน token เดาสุ่มจากไอพีเดียวกัน (ตอบเหมือนกันทุกกรณีที่ยืนยันตัวตนไม่ผ่าน ไม่บอกว่าผิดเพราะอะไร)
  if (isLocked(`mon-ip:${ip}`, Date.now(), MAX_FAILURES_PER_IP)) return json(429, { error: 'too many failed attempts' }, { 'Retry-After': '900' });
  const token = bearer(req.headers.get('authorization'));
  const source = token && looksLikeSourceToken(token) ? await authenticateSource(token) : null;
  if (!source) {
    recordFailure(`mon-ip:${ip}`);
    return json(401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
  }
  if (!allowRate(buckets, source.id)) return json(429, { error: 'rate limit exceeded' }, { 'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)) });

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json(413, { error: 'payload too large' });
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return json(413, { error: 'payload too large' });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(400, { error: 'invalid JSON' });
  }
  const parsed = parseEvent(raw);
  if (!parsed.ok) return json(400, { error: 'invalid payload', details: parsed.errors });

  const r = await ingestEvent(source, parsed.event);
  return json(202, { status: 'accepted', action: r.action, eventId: r.eventId ?? null, incident: r.incident ?? null });
}
