'use client';

import { useEffect, useState } from 'react';
import { formatHms } from '@/lib/sla';

/** ตัวนับถอยหลัง SLA — ถ้า paused แสดงค่าคงที่ */
export function Countdown({ dueAtIso, paused, leftMs, className }: { dueAtIso: string; paused: boolean; leftMs: number; className?: string }) {
  const due = new Date(dueAtIso).getTime();
  const [ms, setMs] = useState(leftMs);

  useEffect(() => {
    if (paused) return;
    const tick = () => setMs(due - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [due, paused]);

  return (
    <span className={className} aria-live="off" suppressHydrationWarning>
      {formatHms(ms)}
    </span>
  );
}
