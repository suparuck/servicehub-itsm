import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// กันการถอยหลังด้านความปลอดภัยของ supply chain: ทุก `uses:` ใน workflow ต้อง pin เป็น commit SHA 40 ตัว
// (tag อย่าง @v4 ย้ายได้ ผู้ดูแล action อาจเปลี่ยนโค้ดใต้ tag เดิม) พร้อมคอมเมนต์เวอร์ชันให้คนอ่านและให้ Dependabot อัปเดต

const WORKFLOWS = join(process.cwd(), '.github', 'workflows');
const read = (p: string) => readFileSync(p, 'utf8');

/** คืนรายการ `uses:` ที่ยังไม่ pin พร้อมเหตุผล */
export function findUnpinned(yaml: string): { line: number; uses: string; why: string }[] {
  const out: { line: number; uses: string; why: string }[] = [];
  yaml.split(/\r?\n/).forEach((text, i) => {
    const m = /^\s*(?:-\s*)?uses:\s*([^\s#]+)\s*(#.*)?$/.exec(text);
    if (!m) return;
    const [, uses, comment] = m;
    if (uses.startsWith('./')) return; // action ในรีโปเดียวกัน
    if (uses.startsWith('docker://')) {
      if (!/@sha256:[0-9a-f]{64}$/.test(uses)) out.push({ line: i + 1, uses, why: 'docker:// ต้องผูก digest sha256' });
      return;
    }
    if (!/@[0-9a-f]{40}$/.test(uses)) out.push({ line: i + 1, uses, why: 'ต้อง pin เป็น commit SHA 40 ตัว ไม่ใช่ tag/branch' });
    else if (!comment || !/#\s*v?\d+(\.\d+)*/.test(comment)) out.push({ line: i + 1, uses, why: 'ต้องมีคอมเมนต์เวอร์ชันท้ายบรรทัด เช่น # v4.4.0' });
  });
  return out;
}

describe('findUnpinned (ตัวตรวจต้องจับของผิดได้จริง)', () => {
  it('จับ tag, branch, ref ว่าง และ SHA ที่สั้นไป', () => {
    expect(findUnpinned('      - uses: actions/checkout@v4')).toHaveLength(1);
    expect(findUnpinned('        uses: actions/cache@main')).toHaveLength(1);
    expect(findUnpinned('      - uses: actions/checkout')).toHaveLength(1);
    expect(findUnpinned('      - uses: actions/checkout@11d5960 # v4.4.0')).toHaveLength(1);
  });
  it('จับ SHA ที่ไม่มีคอมเมนต์เวอร์ชัน', () => {
    expect(findUnpinned('      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262')).toHaveLength(1);
  });
  it('ผ่าน SHA 40 ตัวที่มีคอมเมนต์เวอร์ชัน, action ในรีโป และ docker digest', () => {
    expect(findUnpinned('      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0')).toEqual([]);
    expect(findUnpinned('      - uses: ./.github/actions/local')).toEqual([]);
    expect(findUnpinned(`      - uses: docker://alpine@sha256:${'a'.repeat(64)}`)).toEqual([]);
    expect(findUnpinned('      - uses: docker://alpine:3')).toHaveLength(1);
  });
  it('ไม่นับบรรทัดที่เป็นแค่ข้อความในคอมเมนต์หรือค่าอื่น', () => {
    expect(findUnpinned('      # uses: actions/checkout@v4')).toEqual([]);
    expect(findUnpinned('        run: echo uses: actions/checkout@v4')).toEqual([]);
  });
});

describe('workflow ของโปรเจกต์', () => {
  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));

  it('มี workflow อย่างน้อยหนึ่งไฟล์', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    it(`${f}: ทุก action ถูก pin เป็น SHA พร้อมคอมเมนต์เวอร์ชัน`, () => {
      expect(findUnpinned(read(join(WORKFLOWS, f)))).toEqual([]);
    });
  }

  it('ใช้ action อย่างน้อยหนึ่งตัวจริง (กันเทสต์ผ่านเพราะไม่เจออะไรเลย)', () => {
    const all = files.map((f) => read(join(WORKFLOWS, f))).join('\n');
    expect((all.match(/^\s*(?:-\s*)?uses:/gm) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

describe('dependabot.yml', () => {
  const cfg = read(join(process.cwd(), '.github', 'dependabot.yml'));
  it.each(['github-actions', 'npm', 'docker', 'docker-compose'])('ดูแล ecosystem %s', (eco) => {
    expect(cfg).toContain(`package-ecosystem: ${eco}`);
  });
  it('ทุก ecosystem ตั้งรอบอัปเดต', () => {
    const blocks = cfg.match(/package-ecosystem:/g)?.length ?? 0;
    expect((cfg.match(/interval: weekly/g) ?? []).length).toBe(blocks);
  });
  it('github-actions อัปเดตได้ต่อเมื่อ pin เป็น SHA (Dependabot รองรับ) — ไม่ถูก ignore', () => {
    const block = cfg.split('package-ecosystem: github-actions')[1].split(/\n {2}- package-ecosystem:/)[0];
    expect(block).not.toMatch(/\bignore:/);
  });
});
