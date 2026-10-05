import type { Level, NoteVisibility, Prisma } from '@prisma/client';
import { th } from '@/i18n/th';
import { db } from './db';
import { DomainError } from './errors';
import { allowedTransitions, canTransition, lifecycleStep, type IncidentStatus } from './incident';
import { calcPriority } from './priority';
import { retarget, timerEffects } from './sla';
import { notifyAssigned, notifyCritical, notifyCustomerNote, notifyResolved } from './mail/notify';

export class IncidentError extends DomainError {}

export interface IncidentInput {
  title: string;
  description?: string;
  impact: Level;
  urgency: Level;
  serviceId?: string | null;
  groupId?: string | null;
  assigneeId?: string | null;
  category?: string | null;
  channel?: string | null;
  ciIds?: string[];
  /** ผู้แจ้งที่แท้จริง (Service Desk บันทึกแทนผู้ใช้) — ไม่ระบุ = ผู้บันทึกเอง */
  reporterId?: string | null;
}

const TONE = { accent: 'accent', ok: 'ok', critical: 'critical', ink: 'ink', muted: 'muted' } as const;

async function slaMinutes(serviceId: string | null | undefined, priority: 'P1' | 'P2' | 'P3' | 'P4') {
  const service = serviceId ? await db.service.findUnique({ where: { id: serviceId } }) : null;
  const sla = service?.slaId ? await db.sla.findUnique({ where: { id: service.slaId }, include: { targets: true } }) : await db.sla.findFirst({ include: { targets: true } });
  const pick = (metric: 'RESPONSE' | 'RESOLVE') => sla?.targets.find((t) => t.priority === priority && t.metric === metric)?.minutes;
  return { response: pick('RESPONSE'), resolve: pick('RESOLVE') };
}

export async function createIncident(input: IncidentInput, userId: string | null) {
  const priority = calcPriority(input.impact, input.urgency);
  const status: IncidentStatus = input.assigneeId ? 'ASSIGNED' : 'NEW';
  const now = new Date();
  const { response, resolve } = await slaMinutes(input.serviceId, priority);
  const timers: Prisma.SlaTimerCreateWithoutIncidentInput[] = [];
  if (response) timers.push({ metric: 'RESPONSE', targetMinutes: response, startedAt: now, dueAt: new Date(now.getTime() + response * 60_000), state: 'RUNNING' });
  if (resolve) timers.push({ metric: 'RESOLVE', targetMinutes: resolve, startedAt: now, dueAt: new Date(now.getTime() + resolve * 60_000), state: 'RUNNING' });

  const incident = await db.incident.create({
    data: {
      title: input.title, description: input.description || null, impact: input.impact, urgency: input.urgency, priority, status,
      lifecycleStep: lifecycleStep(status), serviceId: input.serviceId || null, groupId: input.groupId || null,
      assigneeId: input.assigneeId || null, category: input.category || null, channel: input.channel || 'Portal / Service Desk',
      reporterId: input.reporterId ?? userId,
      cis: { create: (input.ciIds ?? []).map((ciId) => ({ ciId, role: 'ได้รับผลกระทบ' })) },
      timers: { create: timers },
      notes: {
        create: [{
          authorId: userId, kind: 'จัดประเภท', tone: TONE.ink,
          body: `บันทึกเหตุขัดข้อง · ผลกระทบ×ความเร่งด่วน = ${priority}`,
        }],
      },
    },
  });
  // การตอบสนองครั้งแรกนับเมื่อมีการมอบหมายตั้งแต่ตอนสร้าง
  if (status !== 'NEW') {
    const created = await db.slaTimer.findMany({ where: { incidentId: incident.id } });
    for (const p of timerEffects(created, 'NEW', status, now)) {
      await db.slaTimer.update({ where: { incidentId_metric: { incidentId: incident.id, metric: p.metric } }, data: p.data });
    }
  }
  if (incident.assigneeId) await notifyAssigned(incident, userId);
  if (priority === 'P1') await notifyCritical(incident, userId);
  return incident;
}

export async function updateIncident(id: string, input: IncidentInput, userId: string | null) {
  const current = await db.incident.findUnique({ where: { id }, include: { timers: true } });
  if (!current) throw new IncidentError('ไม่พบ Incident');
  if (current.status === 'CLOSED') throw new IncidentError('Incident ที่ปิดแล้วแก้ไขไม่ได้');

  const priority = calcPriority(input.impact, input.urgency);
  const changes: string[] = [];
  if (priority !== current.priority) changes.push(`priority ${current.priority} → ${priority}`);
  if ((input.assigneeId || null) !== current.assigneeId) changes.push('เปลี่ยนผู้รับผิดชอบ');
  if ((input.groupId || null) !== current.groupId) changes.push('เปลี่ยนกลุ่มผู้รับผิดชอบ');

  await db.incident.update({
    where: { id },
    data: {
      title: input.title, description: input.description || null, impact: input.impact, urgency: input.urgency, priority,
      serviceId: input.serviceId || null, groupId: input.groupId || null, assigneeId: input.assigneeId || null,
      category: input.category || null,
      ...(input.ciIds ? { cis: { deleteMany: {}, create: input.ciIds.map((ciId) => ({ ciId, role: 'ได้รับผลกระทบ' })) } } : {}),
      ...(changes.length ? { notes: { create: { authorId: userId, kind: 'อัปเดต', tone: TONE.ink, body: `แก้ไขข้อมูล: ${changes.join(' · ')}` } } } : {}),
    },
  });

  // priority เปลี่ยน → ปรับเป้าหมาย SLA ของ timer ที่ยังไม่จบ
  if (priority !== current.priority) {
    const { response, resolve } = await slaMinutes(input.serviceId ?? current.serviceId, priority);
    for (const t of current.timers) {
      const minutes = t.metric === 'RESPONSE' ? response : resolve;
      if (!minutes || t.achievedAt) continue;
      await db.slaTimer.update({ where: { id: t.id }, data: retarget(t, minutes) });
    }
  }

  const after = { ...current, title: input.title, priority, assigneeId: input.assigneeId || null, serviceId: input.serviceId || null };
  if (after.assigneeId && after.assigneeId !== current.assigneeId) await notifyAssigned(after, userId);
  if (priority === 'P1' && current.priority !== 'P1') await notifyCritical(after, userId);
}

export async function changeStatus(id: string, to: IncidentStatus, userId: string | null, note?: string) {
  const inc = await db.incident.findUnique({ where: { id }, include: { timers: true } });
  if (!inc) throw new IncidentError('ไม่พบ Incident');
  const from = inc.status as IncidentStatus;
  if (!canTransition(from, to)) {
    throw new IncidentError(`เปลี่ยนสถานะจาก ${th.incidentStatus[from]} เป็น ${th.incidentStatus[to]} ไม่ได้ (อนุญาต: ${allowedTransitions(from).map((s) => th.incidentStatus[s]).join(', ') || 'ไม่มี'})`);
  }
  if (to === 'RESOLVED' && !note?.trim()) throw new IncidentError('ต้องระบุบันทึกการแก้ไขเมื่อเปลี่ยนเป็นแก้ไขแล้ว');

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.incident.update({
      where: { id },
      data: {
        status: to, lifecycleStep: lifecycleStep(to),
        resolvedAt: to === 'RESOLVED' ? now : to === 'IN_PROGRESS' ? null : undefined,
        closedAt: to === 'CLOSED' ? now : undefined,
        notes: {
          create: {
            authorId: userId, kind: to === 'RESOLVED' ? 'แก้ไขและกู้คืน' : 'เปลี่ยนสถานะ', tone: to === 'RESOLVED' ? TONE.ok : TONE.ink,
            visibility: to === 'RESOLVED' || to === 'PENDING_USER' ? 'CUSTOMER' : 'INTERNAL',
            body: note?.trim() || `เปลี่ยนสถานะจาก ${th.incidentStatus[from]} เป็น ${th.incidentStatus[to]}`,
          },
        },
      },
    });
    for (const p of timerEffects(inc.timers, from, to, now)) {
      await tx.slaTimer.update({ where: { incidentId_metric: { incidentId: id, metric: p.metric } }, data: p.data });
    }
  });
  const text = note?.trim() ?? '';
  if (to === 'RESOLVED') await notifyResolved(inc, text, userId);
  else if (to === 'PENDING_USER') await notifyCustomerNote(inc, text || `เปลี่ยนสถานะจาก ${th.incidentStatus[from]} เป็น ${th.incidentStatus[to]}`, userId);
}

export async function addNote(id: string, body: string, visibility: NoteVisibility, kind: string, userId: string | null) {
  if (!body.trim()) throw new IncidentError('กรุณาพิมพ์ข้อความบันทึก');
  const exists = await db.incident.findUnique({ where: { id } });
  if (!exists) throw new IncidentError('ไม่พบ Incident');
  await db.workNote.create({
    data: {
      incidentId: id, authorId: userId, body: body.trim(), visibility, kind,
      tone: visibility === 'CUSTOMER' ? TONE.ok : TONE.accent,
    },
  });
  if (visibility === 'CUSTOMER') await notifyCustomerNote(exists, body.trim(), userId);
}

export async function escalateMajor(id: string, userId: string | null) {
  const inc = await db.incident.findUnique({ where: { id } });
  if (!inc) throw new IncidentError('ไม่พบ Incident');
  if (inc.isMajor) throw new IncidentError('Incident นี้เป็น Major Incident อยู่แล้ว');
  await db.incident.update({
    where: { id },
    data: {
      isMajor: true,
      notes: { create: { authorId: userId, kind: 'ยกระดับ', tone: TONE.critical, body: 'ประกาศเป็น Major Incident เปิด Bridge call และแจ้งผู้บริหารตาม Communication plan' } },
    },
  });
  await notifyCritical({ ...inc, isMajor: true }, userId);
}

export async function createProblemFromIncident(id: string, userId: string | null) {
  const inc = await db.incident.findUnique({ where: { id } });
  if (!inc) throw new IncidentError('ไม่พบ Incident');
  if (inc.problemId) throw new IncidentError('Incident นี้ผูกกับ Problem อยู่แล้ว');
  const problem = await db.problem.create({ data: { title: inc.title, phase: 'IDENTIFICATION' } });
  await db.incident.update({
    where: { id },
    data: { problemId: problem.id, notes: { create: { authorId: userId, kind: 'Problem', tone: TONE.ink, body: `สร้าง Problem จาก Incident นี้ (PRB-${String(problem.seq).padStart(4, '0')})` } } },
  });
  return problem;
}
