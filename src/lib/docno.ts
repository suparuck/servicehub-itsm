// เลขที่เอกสารมาจากคอลัมน์ seq (sequence ใน DB) แล้วจัดรูปแบบที่นี่
const WIDTH = { INC: 5, REQ: 5, PRB: 4, CHG: 4, KB: 4, IMP: 4, REL: 4 } as const;
export type DocPrefix = keyof typeof WIDTH;

export function formatDocNo(prefix: DocPrefix, seq: number): string {
  return `${prefix}-${String(seq).padStart(WIDTH[prefix], '0')}`;
}

export function parseDocNo(prefix: DocPrefix, value: string): number | null {
  const m = new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(value.trim());
  return m ? Number(m[1]) : null;
}
