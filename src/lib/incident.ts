export type IncidentStatus =
  | 'NEW'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PENDING_USER'
  | 'PENDING_VENDOR'
  | 'RESOLVED'
  | 'CLOSED';

export const ALL_STATUSES: IncidentStatus[] = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING_USER',
  'PENDING_VENDOR',
  'RESOLVED',
  'CLOSED',
];
export const OPEN_STATUSES: IncidentStatus[] = ALL_STATUSES.filter((s) => s !== 'RESOLVED' && s !== 'CLOSED');

// การเปลี่ยนสถานะที่อนุญาต (วงจรชีวิต Incident)
const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  NEW: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'],
  ASSIGNED: ['IN_PROGRESS', 'PENDING_USER', 'PENDING_VENDOR', 'RESOLVED'],
  IN_PROGRESS: ['PENDING_USER', 'PENDING_VENDOR', 'RESOLVED'],
  PENDING_USER: ['IN_PROGRESS', 'RESOLVED'],
  PENDING_VENDOR: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
};

export const allowedTransitions = (from: IncidentStatus) => TRANSITIONS[from];
export const canTransition = (from: IncidentStatus, to: IncidentStatus) => TRANSITIONS[from].includes(to);
export const isOpen = (s: IncidentStatus) => OPEN_STATUSES.includes(s);

/** ขั้นของวงจรชีวิต 1–5: บันทึก → จัดลำดับ → วินิจฉัย → แก้ไข/กู้คืน → ปิด/ทบทวน */
export function lifecycleStep(s: IncidentStatus): number {
  switch (s) {
    case 'NEW':
      return 1;
    case 'ASSIGNED':
      return 2;
    case 'IN_PROGRESS':
    case 'PENDING_USER':
    case 'PENDING_VENDOR':
      return 3;
    case 'RESOLVED':
      return 4;
    case 'CLOSED':
      return 5;
  }
}
