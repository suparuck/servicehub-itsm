import { db } from './db';
import { formatDocNo } from './docno';

export async function getChangeFormOptions() {
  const [services, problems, cis] = await Promise.all([
    db.service.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    db.problem.findMany({ where: { phase: { not: 'RESOLVED' } }, orderBy: { seq: 'desc' }, select: { id: true, seq: true, title: true } }),
    db.configurationItem.findMany({ where: { lifecycle: { not: 'RETIRED' } }, orderBy: { name: 'asc' }, select: { id: true, name: true, classLabel: true } }),
  ]);
  return {
    services,
    problems: problems.map((p) => ({ id: p.id, name: `${formatDocNo('PRB', p.seq)} · ${p.title}` })),
    cis: cis.map((c) => ({ id: c.id, name: c.name, sub: c.classLabel ?? undefined })),
  };
}
