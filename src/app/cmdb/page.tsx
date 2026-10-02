import Link from 'next/link';
import type { CiLifecycle } from '@prisma/client';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, KpiTile, StatusBadge, cx, type Column, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { daysSince } from '@/lib/cmdb';
import { DQ_KEYS, getCmdbSummary, listCis, type DqKey } from '@/lib/cmdbQueries';
import { getCurrentUser } from '@/lib/currentUser';
import { thDayMonthTime } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';

export const dynamic = 'force-dynamic';
type SP = Record<string, string | string[] | undefined>;

const LIFE_TONE: Record<CiLifecycle, Tone> = { PLANNED: 'accent', LIVE: 'ok', MAINTENANCE: 'warn', RETIRED: 'neutral' };
const ENVS = ['Prod', 'UAT', 'Dev'] as const;
const LIFECYCLES: CiLifecycle[] = ['PLANNED', 'LIVE', 'MAINTENANCE', 'RETIRED'];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const control = 'box-border h-11 rounded-control border border-input bg-subtle px-3.5 text-sm';

export default async function CmdbPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = th.cmdb;
  const dq = DQ_KEYS.includes(one(sp.dq) as DqKey) ? (one(sp.dq) as DqKey) : undefined;
  const submitted = one(sp.f) === '1';
  const cls = one(sp.cls) || undefined;
  const q = one(sp.q) || undefined;
  // ค่าเริ่มต้นตามดีไซน์: Production · ใช้งานจริง + บำรุงรักษา (ไม่ใช้เมื่อกรองตามงานคุณภาพข้อมูล)
  const env = submitted ? many(sp.env) : dq ? [] : ['Prod'];
  const lifecycle = (submitted ? many(sp.lifecycle) : dq ? [] : ['LIVE', 'MAINTENANCE']).filter((l): l is CiLifecycle => LIFECYCLES.includes(l as CiLifecycle));

  const [user, summary, res] = await Promise.all([
    getCurrentUser(),
    getCmdbSummary(),
    listCis({ q, cls, env, lifecycle, dq, page: Number(one(sp.page)) || 1 }),
  ]);

  const url = (over: Record<string, string | string[] | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | string[] | undefined> = { q, cls, dq, f: submitted ? '1' : undefined, env: submitted ? env : undefined, lifecycle: submitted ? lifecycle : undefined };
    for (const [k, v] of Object.entries({ ...base, ...over })) {
      if (v === undefined || v === '') continue;
      for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
    }
    const s = p.toString();
    return `/cmdb${s ? `?${s}` : ''}`;
  };

  const kpis = [
    { label: t.kpi.total, value: String(summary.total), note: t.kpi.noteTotal(summary.active), good: true },
    { label: t.kpi.rels, value: String(summary.rels), note: t.kpi.noteRels((summary.total ? summary.rels / summary.total : 0).toFixed(1)), good: true },
    { label: t.kpi.accuracy, value: `${summary.accuracyPct.toFixed(1)}%`, note: t.kpi.noteAccuracy, good: summary.accuracyPct >= 95 },
    { label: t.kpi.noOwner, value: String(summary.dq.noOwner), note: t.kpi.noteNoOwner, good: summary.dq.noOwner === 0 },
    { label: t.kpi.stale, value: String(summary.dq.stale), note: t.kpi.noteStale, good: summary.dq.stale === 0 },
    { label: t.kpi.coverage, value: `${summary.coverage.modelled}/${summary.coverage.total}`, note: t.kpi.noteCoverage, good: summary.coverage.modelled === summary.coverage.total },
  ];

  type Row = (typeof res.rows)[number];
  const flag = (r: Row): { text: string; p1: boolean } | null => {
    const open = r.incidents.map((x) => ({ ...x.incident, role: x.role })).filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status));
    if (open.length) {
      const i = open.sort((a, b) => a.priority.localeCompare(b.priority))[0];
      const no = `${formatDocNo('INC', i.seq)} (${i.priority})`;
      const chg = r.changes.map((x) => x.change).find((c) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(c.status));
      return { text: i.role === 'ได้รับผลกระทบ' ? t.flagImpacted(no) : chg ? `${no} · ${formatDocNo('CHG', chg.seq)}` : no, p1: i.priority === 'P1' };
    }
    const chg = r.changes.map((x) => x.change).find((c) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(c.status));
    if (chg) return { text: `${formatDocNo('CHG', chg.seq)} · ${chg.title}`, p1: false };
    const d = daysSince(r.lastDiscoveredAt);
    if (r.driftNote) return { text: r.driftNote, p1: false };
    if (d !== null && d > 90 && r.lifecycle !== 'PLANNED') return { text: t.flagStale(d), p1: false };
    return null;
  };
  const owner = (r: Row) => r.ownerUser?.name ?? r.ownerGroup?.name ?? r.ownerLabel ?? null;

  const columns: Column<Row>[] = [
    { key: 'id', header: t.colId, render: (r) => <span className="font-mono text-xs">{r.ciId}</span> },
    {
      key: 'name', header: t.colName,
      render: (r) => {
        const f = flag(r);
        return (
          <span className="flex min-w-0 flex-col">
            <Link href={`/cmdb/${r.ciId}`} className="inline-flex min-h-[44px] items-center font-medium text-ink hover:text-accent">{r.name}</Link>
            {f && <span className={cx('-mt-2.5 pb-1 text-xs', f.p1 ? 'text-critical-fg' : 'text-muted')}>{f.text}</span>}
          </span>
        );
      },
    },
    { key: 'cls', header: t.colClass, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.classLabel ?? t.classes[r.ciClass]}</span> },
    { key: 'env', header: t.colEnv, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.environment}</span> },
    { key: 'st', header: t.colStatus, render: (r) => <StatusBadge tone={LIFE_TONE[r.lifecycle]} className="text-xs">{t.lifecycle[r.lifecycle]}</StatusBadge> },
    { key: 'owner', header: t.colOwner, hideOnSmall: true, render: (r) => <span className={cx('text-[13px]', !owner(r) && 'text-critical-fg')}>{owner(r) ?? t.noOwner}</span> },
    { key: 'seen', header: t.colSeen, hideOnSmall: true, render: (r) => <span className="font-mono text-xs text-muted">{r.lastDiscoveredAt ? thDayMonthTime(r.lastDiscoveredAt) : '—'}</span> },
  ];

  const desc = [env.map((e) => t.envs[e as keyof typeof t.envs] ?? e).join(' / '), lifecycle.map((l) => t.lifecycle[l]).join(' + ')].filter(Boolean).join(' · ');
  const hiddenKeep = (
    <>
      {cls && <input type="hidden" name="cls" value={cls} />}
      {dq && <input type="hidden" name="dq" value={dq} />}
    </>
  );

  return (
    <>
      <PageHeader
        breadcrumb={<><Link href="/">แดชบอร์ด</Link> › Obtain / Build › Service Configuration Management</>}
        title={t.title}
        initials={user?.initials ?? '··'}
        custom={
          <>
            <form action="/cmdb" method="get" role="search" className="flex">
              <label htmlFor="cq" className="sr-only">{t.searchLabel}</label>
              <input id="cq" type="search" name="q" defaultValue={q} placeholder={t.searchPlaceholder} className={cx(control, 'w-[320px] max-w-full')} />
              {hiddenKeep}
              {submitted && <input type="hidden" name="f" value="1" />}
              {submitted && env.map((e) => <input key={e} type="hidden" name="env" value={e} />)}
              {submitted && lifecycle.map((l) => <input key={l} type="hidden" name="lifecycle" value={l} />)}
            </form>
            <Link href="/cmdb/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">
              {t.addCi}
            </Link>
          </>
        }
      />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <section aria-label={t.kpiAria} className="grid grid-cols-2 gap-3 xs:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => <KpiTile key={k.label} {...k} practice="" />)}
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[232px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-3.5 self-start rounded-card border border-border bg-surface p-4">
            <nav aria-label={t.classTitle} className="flex flex-col gap-0.5">
              <span className="px-2 pb-1.5 text-xs font-semibold tracking-[0.04em] text-muted">{t.classTitle}</span>
              {[{ key: undefined as string | undefined, name: t.all, n: summary.total }, ...(Object.keys(t.classes) as (keyof typeof t.classes)[]).map((k) => ({ key: k as string | undefined, name: t.classes[k], n: summary.classCounts[k] ?? 0 }))].map((c) => (
                <Link
                  key={c.name} href={url({ cls: c.key, page: undefined })} aria-current={cls === c.key ? 'true' : undefined}
                  className={cx('flex min-h-[44px] items-center justify-between rounded-md px-2.5 text-sm no-underline', cls === c.key ? 'bg-ink font-semibold text-white hover:text-white' : 'text-ink hover:bg-subtle hover:text-ink')}
                >
                  <span>{c.name}</span>
                  <span className="font-mono text-xs">{c.n}</span>
                </Link>
              ))}
            </nav>
            <form action="/cmdb" method="get" className="flex flex-col gap-3.5">
              <input type="hidden" name="f" value="1" />
              {q && <input type="hidden" name="q" value={q} />}
              {hiddenKeep}
              <fieldset className="m-0 flex flex-col gap-0.5 border-0 border-t border-divider p-0 pt-3">
                <legend className="px-2 pb-1 text-xs font-semibold tracking-[0.04em] text-muted">{t.envTitle}</legend>
                {ENVS.map((e) => (
                  <label key={e} className="flex min-h-[44px] items-center gap-2 px-2 text-sm"><input type="checkbox" name="env" value={e} defaultChecked={env.includes(e)} className="h-4 w-4" />{t.envs[e]}</label>
                ))}
              </fieldset>
              <fieldset className="m-0 flex flex-col gap-0.5 border-0 border-t border-divider p-0 pt-3">
                <legend className="px-2 pb-1 text-xs font-semibold tracking-[0.04em] text-muted">{t.lifecycleTitle}</legend>
                {LIFECYCLES.map((l) => (
                  <label key={l} className="flex min-h-[44px] items-center gap-2 px-2 text-sm"><input type="checkbox" name="lifecycle" value={l} defaultChecked={lifecycle.includes(l)} className="h-4 w-4" />{t.lifecycle[l]}</label>
                ))}
              </fieldset>
              <button type="submit" className="h-11 rounded-control bg-ink text-sm font-semibold text-white">{t.applyFilters}</button>
            </form>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <Card className="gap-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                <h2 className="m-0 text-[17px] font-semibold">{t.tableTitle}</h2>
                <span className="text-[13px] text-muted" aria-live="polite">{t.shown(res.rows.length, res.total, desc)}</span>
              </div>
              {dq && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-accent-tint px-3 py-2 text-sm text-accent-hover">
                  <span>{t.dqFilter(t.dq[dq].title)}</span>
                  <Link href="/cmdb" className="inline-flex min-h-[44px] items-center">{t.dqClear}</Link>
                </div>
              )}
              <DataTable columns={columns} rows={res.rows} rowKey={(r) => r.id} empty={t.empty} gridClass="grid-cols-ci-s md:grid-cols-ci" />
              {res.pages > 1 && (
                <nav aria-label="หน้า" className="flex items-center justify-between gap-3 pt-2 text-sm">
                  {res.page > 1 ? <Link href={url({ page: String(res.page - 1) })} className="inline-flex min-h-[44px] items-center">{th.incident.prev}</Link> : <span />}
                  <span className="text-muted">{th.incident.page(res.page, res.pages)}</span>
                  {res.page < res.pages ? <Link href={url({ page: String(res.page + 1) })} className="inline-flex min-h-[44px] items-center">{th.incident.next}</Link> : <span />}
                </nav>
              )}
            </Card>

            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                <h2 className="m-0 text-[17px] font-semibold">{t.dq.title}</h2>
                <span className="text-xs text-muted">{t.dq.sub}</span>
              </div>
              {DQ_KEYS.map((k) => (
                <div key={k} className="flex flex-wrap items-center justify-between gap-3 border-t border-divider py-2.5">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{t.dq[k].title}</span>
                    <span className="text-xs text-muted">{t.dq[k].desc}</span>
                  </div>
                  <div className="flex items-center gap-3.5">
                    <span className="font-mono text-[22px] font-bold">{summary.dq[k]}</span>
                    <Link href={`/cmdb?dq=${k}`} className="inline-flex h-11 items-center rounded-control border border-input bg-surface px-4 text-sm text-ink no-underline hover:text-ink">{t.dq[k].action}</Link>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
