import { purgeOldNotifications } from '../notificationService';
import { processSlaAlerts } from './notify';

/** ตรวจ SLA ใกล้ผิด/ผิดกำหนดทุก 1 นาที (ส่งอย่างละครั้งต่อ timer — ดู processSlaAlerts) */
const g = globalThis as unknown as { slaWatcher?: ReturnType<typeof setInterval> };

export function startSlaWatcher(intervalMs = 60_000) {
  if (g.slaWatcher) return;
  let running = false;
  let ticks = 0;
  g.slaWatcher = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processSlaAlerts();
      if (ticks++ % 60 === 0) await purgeOldNotifications(); // ทุก ~1 ชม. (และตอนเริ่ม)
    } catch (err) {
      console.error('[sla] watcher error', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  }, intervalMs);
  g.slaWatcher.unref?.();
}
