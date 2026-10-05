import type { Prisma, PrismaClient } from '@prisma/client';
import { db } from './db';

type Client = PrismaClient | Prisma.TransactionClient;
export type AuditEntity = 'PROBLEM' | 'CHANGE' | 'REQUEST' | 'KB' | 'USER' | 'SERVICE' | 'ASSET' | 'IMPROVEMENT' | 'DESK' | 'MONITORING' | 'RELEASE' | 'SETTINGS';

export function logAudit(entityType: AuditEntity, entityId: string, userId: string | null, text: string, client: Client = db) {
  return client.auditLog.create({ data: { entityType, entityId, userId, text } });
}

export function getAudit(entityType: AuditEntity, entityId: string) {
  return db.auditLog.findMany({ where: { entityType, entityId }, orderBy: { at: 'desc' }, include: { user: true }, take: 50 });
}
