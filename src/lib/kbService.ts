import { db } from './db';
import { logAudit } from './audit';
import { DomainError } from './errors';
import { assertCan, type Role } from './permissions';
import { formatDocNo } from './docno';

export class KbError extends DomainError {}
type Actor = { id: string; role: Role };
export interface KbInput {
  title: string;
  body: string;
  problemId?: string | null;
}

function check(i: KbInput) {
  if (!i.title.trim()) throw new KbError('กรุณาระบุหัวข้อบทความ');
  if (i.title.length > 200) throw new KbError('หัวข้อยาวเกิน 200 ตัวอักษร');
  if (!i.body.trim()) throw new KbError('กรุณาระบุเนื้อหาบทความ');
}

export async function createArticle(actor: Actor, input: KbInput) {
  assertCan(actor.role, 'kb.manage');
  check(input);
  const a = await db.knowledgeArticle.create({ data: { title: input.title.trim(), body: input.body.trim(), problemId: input.problemId || null, status: 'DRAFT' } });
  await logAudit('KB', a.id, actor.id, 'สร้างบทความ (ร่าง)');
  return a;
}

export async function updateArticle(actor: Actor, id: string, input: KbInput) {
  assertCan(actor.role, 'kb.manage');
  check(input);
  const cur = await db.knowledgeArticle.findUnique({ where: { id } });
  if (!cur) throw new KbError('ไม่พบบทความ');
  await db.knowledgeArticle.update({ where: { id }, data: { title: input.title.trim(), body: input.body.trim(), problemId: input.problemId || null } });
  await logAudit('KB', id, actor.id, `แก้ไขบทความ${cur.status === 'PUBLISHED' ? ' (เผยแพร่อยู่ — ผู้ใช้เห็นเนื้อหาใหม่ทันที)' : ''}`);
}

export async function setStatus(actor: Actor, id: string, status: 'DRAFT' | 'PUBLISHED') {
  assertCan(actor.role, 'kb.publish');
  const cur = await db.knowledgeArticle.findUnique({ where: { id } });
  if (!cur) throw new KbError('ไม่พบบทความ');
  if (cur.status === status) throw new KbError('บทความอยู่ในสถานะนี้อยู่แล้ว');
  if (status === 'PUBLISHED' && (!cur.body?.trim() || !cur.title.trim())) throw new KbError('ต้องมีหัวข้อและเนื้อหาก่อนเผยแพร่');
  await db.knowledgeArticle.update({ where: { id }, data: { status } });
  await logAudit('KB', id, actor.id, status === 'PUBLISHED' ? `เผยแพร่ ${formatDocNo('KB', cur.seq)} ในพอร์ทัล` : 'ยกเลิกการเผยแพร่ (กลับเป็นร่าง)');
}
