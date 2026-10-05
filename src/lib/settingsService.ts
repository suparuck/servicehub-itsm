import { logAudit } from './audit';
import { DEFAULT_ALERT_DAYS, parseAlertDays } from './asset';
import { db } from './db';
import { DomainError } from './errors';
import { assertCan, type Role } from './permissions';

export class SettingsError extends DomainError {}
type Actor = { id: string; role: Role };

const KEY_ASSET_DAYS = 'assetAlertDays';

/** เกณฑ์วันแจ้งเตือนประกัน/ไลเซนส์ใกล้หมด (เรียงมากไปน้อย) — ไม่มีค่า/ค่าเสียหายในฐานข้อมูล = ค่าเริ่มต้น 90, 30, 7 */
export async function getAssetAlertDays(): Promise<number[]> {
  const row = await db.appSetting.findUnique({ where: { key: KEY_ASSET_DAYS } });
  const v = row?.value;
  if (Array.isArray(v) && v.every((n) => typeof n === 'number')) {
    const parsed = parseAlertDays((v as number[]).join(','));
    if (parsed.ok) return parsed.days;
  }
  return [...DEFAULT_ALERT_DAYS];
}

export async function setAssetAlertDays(actor: Actor, text: string) {
  assertCan(actor.role, 'settings.manage');
  const p = parseAlertDays(text);
  if (!p.ok) throw new SettingsError(p.error);
  const before = await getAssetAlertDays();
  if (before.join() === p.days.join()) return;
  await db.appSetting.upsert({ where: { key: KEY_ASSET_DAYS }, create: { key: KEY_ASSET_DAYS, value: p.days, updatedById: actor.id }, update: { value: p.days, updatedById: actor.id } });
  await logAudit('SETTINGS', 'alerts', actor.id, `เกณฑ์วันแจ้งเตือนประกัน/ไลเซนส์ใกล้หมด: ${before.join(', ')} → ${p.days.join(', ')} วัน`);
}

export async function resetAssetAlertDays(actor: Actor) {
  assertCan(actor.role, 'settings.manage');
  const before = await getAssetAlertDays();
  await db.appSetting.deleteMany({ where: { key: KEY_ASSET_DAYS } });
  if (before.join() !== DEFAULT_ALERT_DAYS.join()) await logAudit('SETTINGS', 'alerts', actor.id, `คืนเกณฑ์วันแจ้งเตือนเป็นค่าเริ่มต้น: ${before.join(', ')} → ${DEFAULT_ALERT_DAYS.join(', ')} วัน`);
}
