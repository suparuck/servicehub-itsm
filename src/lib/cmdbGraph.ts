// กราฟความสัมพันธ์ CI — ใช้ทำ Service Model และ Impact Analysis (ฟังก์ชันบริสุทธิ์)
export type RelType = 'DEPENDS_ON' | 'RUNS_ON' | 'CONNECTS_TO' | 'HOSTS';
export interface Rel {
  sourceId: string;
  targetId: string;
  type: RelType;
}

/** ทำให้ทุกความสัมพันธ์เป็นรูป "dependent → dependency" (ผู้ขึ้นอยู่กับ → สิ่งที่ถูกพึ่งพา) */
export function normalize(rels: Rel[]): { from: string; to: string }[] {
  return rels.map((r) => (r.type === 'HOSTS' ? { from: r.targetId, to: r.sourceId } : { from: r.sourceId, to: r.targetId }));
}

function walk(start: string, adj: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next) && next !== start) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function adjacency(edges: { from: string; to: string }[], reverse: boolean) {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const [a, b] = reverse ? [e.to, e.from] : [e.from, e.to];
    adj.set(a, [...(adj.get(a) ?? []), b]);
  }
  return adj;
}

/** CI ที่ขึ้นอยู่กับ id (ไล่ขึ้นไปหา Business Service) — ได้รับผลกระทบเมื่อ id หยุดทำงาน */
export function dependents(id: string, rels: Rel[]): Set<string> {
  return walk(id, adjacency(normalize(rels), true));
}

/** CI ที่ id ต้องพึ่งพา (ไล่ลงไปหาโครงสร้างพื้นฐาน) */
export function dependencies(id: string, rels: Rel[]): Set<string> {
  return walk(id, adjacency(normalize(rels), false));
}

/** การเพิ่ม source→target จะทำให้เกิดวงวน (หรือชี้ตัวเอง) หรือไม่ */
export function wouldCreateCycle(rel: Rel, rels: Rel[]): boolean {
  const { from, to } = normalize([rel])[0];
  if (from === to) return true;
  // วงวนเกิดเมื่อ `to` พึ่งพา `from` อยู่แล้ว (ทางอ้อม)
  return dependencies(to, rels).has(from);
}

const TIER_BY_CLASS: Record<string, number> = {
  BUSINESS_SERVICE: 0,
  APPLICATION: 1,
  DATABASE: 2,
  SERVER: 3,
  NETWORK_DEVICE: 3,
  CLOUD_RESOURCE: 3,
  END_USER_DEVICE: 3,
  SOFTWARE_LICENSE: 3,
};
export const tierOf = (ciClass: string) => TIER_BY_CLASS[ciClass] ?? 3;
