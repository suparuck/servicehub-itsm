// Service Request — กฎวงจรชีวิต (ฟังก์ชันบริสุทธิ์)
export type RequestStatus = 'SUBMITTED' | 'PENDING_APPROVAL' | 'FULFILLING' | 'DELIVERED' | 'REJECTED' | 'CANCELLED';

/** ขั้นปัจจุบัน 1–4: ส่ง → อนุมัติ → จัดเตรียม → ส่งมอบ (ใช้เป็นจำนวนแถบความคืบหน้า) */
export function requestStage(status: RequestStatus): number {
  switch (status) {
    case 'SUBMITTED':
      return 1;
    case 'PENDING_APPROVAL':
      return 2;
    case 'FULFILLING':
      return 3;
    case 'DELIVERED':
      return 4;
    default:
      return 1;
  }
}

export const isFinished = (s: RequestStatus) => s === 'DELIVERED' || s === 'REJECTED' || s === 'CANCELLED';

/** ส่งมอบได้เมื่ออยู่ระหว่างจัดเตรียมและงานทุกชิ้นเสร็จ */
export function deliverCheck(status: RequestStatus, tasks: { done: boolean }[]): string | null {
  if (status !== 'FULFILLING') return 'ส่งมอบได้เฉพาะคำขอที่อยู่ระหว่างจัดเตรียม';
  const open = tasks.filter((t) => !t.done).length;
  return open > 0 ? `ยังมีงานจัดเตรียมที่ไม่เสร็จ ${open} รายการ` : null;
}

/** ผลการอนุมัติ: ไม่อนุมัติแม้คนเดียว = ปฏิเสธ · อนุมัติครบทุกคน = ผ่าน */
export function approvalOutcome(decisions: (string | null)[]): 'APPROVED' | 'REJECTED' | 'PENDING' {
  if (decisions.length === 0) return 'PENDING';
  if (decisions.includes('REJECTED')) return 'REJECTED';
  return decisions.every((d) => d === 'APPROVED') ? 'APPROVED' : 'PENDING';
}
