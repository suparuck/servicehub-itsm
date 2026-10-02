/** ข้อผิดพลาดที่เกิดจากการใช้งาน (แสดงให้ผู้ใช้เห็นได้) — ต่างจากบั๊กที่ต้องปล่อยให้ error boundary จัดการ */
export class DomainError extends Error {}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
