import { startMailWorker } from './outbox';
import { startSlaWatcher } from './slaWatcher';

/** เริ่มตัวส่งอีเมลและตัวตรวจ SLA ในโปรเซสเว็บ (MAIL_WORKER=off เพื่อปิด เมื่อแยก worker ต่างหาก) */
export function startBackgroundWorkers() {
  if (process.env.MAIL_WORKER === 'off') return;
  startMailWorker();
  startSlaWatcher();
}
