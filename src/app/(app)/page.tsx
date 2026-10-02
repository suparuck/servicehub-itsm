import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, DataTable, KpiTile, PriorityChip, SlaBar, StatusBadge, cx, PRIORITY_CELL_STYLE, type Column, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { getDashboard, type QueueFilter } from '@/lib/dashboard';
import { thDay, thMonthShort, thTime, thWindow, formatRemaining } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { calcPriority } from '@/lib/priority';
import { SLA_TARGET_PCT, formatDuration, meetsTarget } from '@/lib/slaStats';

export const dynamic = 'force-dynamic';

const CHAIN = [
  { no: '01', en: 'Plan', th: 'วางแผน', what: 'แผนงานบริการและงบประมาณ' },
  { no: '02', en: 'Improve', th: 'ปรับปรุง', what: 'รายการปรับปรุงที่ดำเนินการ' },
  { no: '03', en: 'Engage', th: 'มีส่วนร่วม', what: 'การติดต่อผู้ใช้เดือนนี้' },
  { no: '04', en: 'Design & Transition', th: 'ออกแบบและเปลี่ยนผ่าน', what: 'Change รออนุมัติ / กำหนดการ' },
  { no: '05', en: 'Obtain / Build', th: 'จัดหาและสร้าง', what: 'CI ใน CMDB' },
  { no: '06', en: 'Deliver & Support', th: 'ส่งมอบและสนับสนุน', what: 'Incident + Request เปิดอยู่' },
];

const CHANGE_TONE: Record<string, Tone> = { STANDARD: 'ok', NORMAL: 'accent', EMERGENCY: 'critical' };

const HEALTH = {
  OK: { text: 'text-ok-fg', icon: 'h-2 w-2 rounded-full bg-ok' },
  DEGRADED: { text: 'text-warn-fg', icon: 'h-0 w-0 border-x-[5px] border-b-[9px] border-x-transparent border-b-warn' },
  DOWN: { text: 'text-critical-fg', icon: 'h-[9px] w-[9px] bg-critical' },
} as const;

const mono = 'font-mono';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const filter: QueueFilter = sp.filter === 'mine' || sp.filter === 'near' ? sp.filter : 'all';
  const user = await getCurrentUser();
  const d = await getDashboard(filter, user?.id);
  const { snap } = d;
  const t = th.dashboard;

  const kpis = [
    { label: 'Incident เปิดอยู่', value: String(d.counts.all), note: `▲ P1 จำนวน ${d.p1} รายการ`, good: false, practice: 'Incident Management' },
    snap.kpis && { label: 'คำขอบริการรอดำเนินการ', ...snap.kpis.requests, practice: 'Service Request' },
    (d.sla.mttrMin !== null ? { label: 'MTTR เฉลี่ย', value: formatDuration(d.sla.mttrMin), note: `${d.sla.samples} รายการ · 30 วันล่าสุด`, good: true, practice: 'Incident Management' } : snap.kpis && { label: 'MTTR เฉลี่ย', ...snap.kpis.mttr, practice: 'Incident Management' }),
    (d.sla.resolvePct !== null ? { label: 'บรรลุ SLA', value: `${d.sla.resolvePct}%`, note: `เป้าหมาย ${SLA_TARGET_PCT}%`, good: meetsTarget(d.sla.resolvePct), practice: 'Service Level Mgmt' } : snap.kpis && { label: 'บรรลุ SLA', ...snap.kpis.sla, practice: 'Service Level Mgmt' }),
    snap.kpis && { label: 'Change สำเร็จ', ...snap.kpis.changeSuccess, practice: 'Change Enablement' },
    snap.kpis && { label: 'ความพึงพอใจ (CSAT)', ...snap.kpis.csat, practice: 'Service Desk' },
  ].filter((k): k is NonNullable<typeof k> => !!k);

  type Row = (typeof d.queue)[number];
  const columns: Column<Row>[] = [
    {
      key: 'id',
      header: t.colId,
      render: (r) => (
        <Link href={`/incidents/${formatDocNo('INC', r.seq)}`} className={cx(mono, 'inline-flex min-h-[44px] items-center text-[13px]')}>
          {formatDocNo('INC', r.seq)}
        </Link>
      ),
    },
    {
      key: 'title',
      header: t.colTitle,
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{r.title}</span>
          <span className="text-xs text-muted">
            {r.service?.fullName ?? r.service?.name}
            {r.isMajor ? ` · ${t.majorIncident}` : ''}
          </span>
        </span>
      ),
    },
    { key: 'group', header: t.colGroup, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.group?.name}</span> },
    { key: 'p', header: t.colPriority, render: (r) => <PriorityChip priority={r.priority} /> },
    { key: 'status', header: t.colStatus, hideOnSmall: true, render: (r) => <span className="text-[13px]">{th.incidentStatus[r.status]}</span> },
    {
      key: 'sla',
      header: t.colSla,
      hideOnSmall: true,
      render: (r) => (r.leftMin === null ? '—' : <SlaBar label={formatRemaining(r.leftMin)} pct={r.pct ?? 0} />),
    },
  ];

  const pill = (key: QueueFilter, label: string, n: number) => (
    <Link
      key={key}
      href={key === 'all' ? '/' : `/?filter=${key}`}
      aria-current={filter === key ? 'true' : undefined}
      className={cx(
        'inline-flex min-h-[44px] items-center rounded-full border px-3 text-[13px] no-underline',
        filter === key ? 'border-ink bg-ink text-white hover:text-white' : 'border-input bg-surface text-ink hover:text-ink',
      )}
    >
      {label} {n}
    </Link>
  );

  const bkkNow = thTime(new Date());

  return (
    <>
      <PageHeader breadcrumb={th.header.breadcrumb} title={th.header.title} initials={user?.initials ?? '··'} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-5 px-7 pb-10 pt-6">
        {/* KPI */}
        <section aria-label={t.kpiAria} className="grid grid-cols-2 gap-3 xs:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => (
            <KpiTile key={k.label} {...k} />
          ))}
        </section>

        {/* Service value chain */}
        <Card className="gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="m-0 text-[17px] font-semibold">{t.chainTitle}</h2>
            <span className="text-[13px] text-muted">{t.chainSub}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 xs:grid-cols-3 lg:grid-cols-6">
            {CHAIN.map((c, i) => (
              <div key={c.no} className="flex flex-col gap-1 rounded-control border border-border bg-subtle p-3">
                <span className={cx(mono, 'text-[11px] text-muted')}>
                  {c.no} · {c.en}
                </span>
                <span className="text-[15px] font-semibold">{c.th}</span>
                <span className={cx(mono, 'text-2xl font-bold')}>{i === 4 ? d.ciCount.toLocaleString('en-US') : (snap.chain?.[i] ?? '—')}</span>
                <span className="text-xs text-muted">{c.what}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          {/* Left column */}
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 text-[17px] font-semibold">{t.queueTitle}</h2>
                <nav aria-label="กรองคิว Incident" className="flex flex-wrap gap-1.5">
                  {pill('all', t.filterAll, d.counts.all)}
                  {pill('mine', t.filterMine, d.counts.mine)}
                  {pill('near', t.filterNearSla, d.counts.near)}
                </nav>
              </div>
              <DataTable columns={columns} rows={d.queue} rowKey={(r) => r.id} empty={t.queueEmpty} gridClass="grid-cols-trow-s md:grid-cols-trow" />
              <Link href="/incidents" className="inline-flex min-h-[44px] items-center self-start text-sm">
                {t.viewAllIncidents}
              </Link>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <CardTitle sub={t.changesSub}>{t.changesTitle}</CardTitle>
                {d.changes.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 border-t border-divider py-2.5">
                    <div className="w-[52px] shrink-0 rounded-control border border-border py-1 text-center">
                      <div className="text-[11px] text-muted">{thMonthShort(c.windowStart)}</div>
                      <div className={cx(mono, 'text-lg font-bold')}>{thDay(c.windowStart)}</div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-[3px]">
                      <span className="text-sm font-medium">{c.title}</span>
                      <span className="text-xs text-muted">
                        <span className={mono}>{formatDocNo('CHG', c.seq)}</span> · {thWindow(c.windowStart, c.windowEnd)} · {t.riskPrefix}
                        {th.risk[c.risk]}
                      </span>
                      <StatusBadge tone={CHANGE_TONE[c.type]}>{th.changeType[c.type]}</StatusBadge>
                    </div>
                  </div>
                ))}
              </Card>

              <Card>
                <CardTitle sub={t.problemsSub}>{t.problemsTitle}</CardTitle>
                {d.problems.map((p) => (
                  <div key={p.id} className="flex flex-col gap-1 border-t border-divider py-2.5">
                    <div className="flex justify-between gap-2">
                      <span className={cx(mono, 'text-xs text-muted')}>{formatDocNo('PRB', p.seq)}</span>
                      <span className="text-xs font-semibold">{p.phaseLabel ?? th.problemPhase[p.phase]}</span>
                    </div>
                    <span className="text-sm font-medium">{p.title}</span>
                    <span className="text-xs text-muted">
                      {t.linkedIncidents(p._count.incidents)} · {p.workNote}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          </div>

          {/* Right column */}
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardTitle sub={t.servicesSub(bkkNow)}>{t.servicesTitle}</CardTitle>
              {d.services.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2.5 border-t border-divider py-1.5">
                  <span className="text-sm">{s.name}</span>
                  <span className={cx('inline-flex items-center gap-1.5 text-[13px] font-semibold', HEALTH[s.health].text)}>
                    <span aria-hidden="true" className={HEALTH[s.health].icon} />
                    {th.serviceHealth[s.health]}
                  </span>
                </div>
              ))}
            </Card>

            <Card>
              <CardTitle sub={t.matrixSub}>{t.matrixTitle}</CardTitle>
              <div className="grid grid-cols-[76px_repeat(3,minmax(0,1fr))] gap-1.5 text-xs">
                <span />
                {t.matrixUrgency.map((u) => (
                  <span key={u} className="text-center text-muted">
                    {u}
                  </span>
                ))}
                {d.matrix.map((row, ri) => (
                  <MatrixRow key={ri} label={t.matrixImpact[ri]} cells={row} />
                ))}
              </div>
            </Card>

            <Card>
              <CardTitle sub={t.slaSub}>{t.slaTitle}</CardTitle>
              {(d.sla.rows.length ? d.sla.rows.map((r) => ({ name: r.group, pct: r.pct as number })) : (snap.slaByService ?? [])).map((s) => (
                <div key={s.name} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[13px]">
                    <span>{s.name}</span>
                    <span className={cx(mono, 'font-semibold')}>{s.pct}%</span>
                  </div>
                  <div className="relative h-2.5 rounded-[5px] bg-divider">
                    <div
                      className={cx('absolute inset-y-0 left-0 rounded-[5px]', s.pct >= 95 ? 'bg-accent' : 'bg-warn')}
                      style={{ width: `${s.pct}%` }}
                    />
                    <div role="img" aria-label={t.slaTargetAria} className="absolute -bottom-[3px] -top-[3px] left-[95%] border-l-2 border-dashed border-ink" />
                  </div>
                </div>
              ))}
            </Card>

            <Card dark>
              <CardTitle dark sub={t.improveSub}>
                {t.improveTitle}
              </CardTitle>
              {d.improve.map((i) => (
                <div key={i.id} className="flex flex-col gap-1.5 border-t border-[#343A42] py-2.5">
                  <span className="text-sm font-medium">{i.title}</span>
                  <div className="grid grid-cols-7 gap-[3px]">
                    {Array.from({ length: 7 }, (_, n) => (
                      <span key={n} className={cx('h-1.5 rounded-[3px]', n + 1 <= i.step ? 'bg-accent-light' : 'bg-[#343A42]')} />
                    ))}
                  </div>
                  <span className="text-xs text-[#A9AFB9]">{t.improveStep(i.step, t.improveSteps[i.step - 1])}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>

        <footer className="text-xs text-muted">{t.footer}</footer>
      </div>
    </>
  );
}

function MatrixRow({
  label,
  cells,
}: {
  label: string;
  cells: { impact: 'HIGH' | 'MED' | 'LOW'; urgency: 'HIGH' | 'MED' | 'LOW'; n: number }[];
}) {
  return (
    <>
      <span className="self-center text-muted">{label}</span>
      {cells.map((c) => {
        const p = calcPriority(c.impact, c.urgency);
        return (
          <div
            key={c.urgency}
            className={cx('flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-md', PRIORITY_CELL_STYLE[p])}
          >
            <span className="font-semibold">{p}</span>
            <span className="font-mono text-lg font-bold">{c.n}</span>
          </div>
        );
      })}
    </>
  );
}
