import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, DataTable, PriorityChip, StatusBadge, cx, type Column } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateShort, thTime } from '@/lib/datetime';
import type { IncidentStatus } from '@/lib/incident';
import { can, type Role } from '@/lib/permissions';
import { DESK_CHANNELS, filterQueue, parseTab, parseType, tabCounts, type QueueItem, type QueueTab } from '@/lib/serviceDesk';
import { loadQueue, queueChannels, staffUsers } from '@/lib/serviceDeskService';
import { assignAction, claimAction } from './actions';

export const dynamic = 'force-dynamic';
const control = 'box-border h-11 rounded-control border border-input bg-surface px-3 text-sm';
const btn = 'h-11 rounded-control border border-input bg-surface px-3 text-sm';
type SP = { tab?: string; type?: string; channel?: string; error?: string };

export default async function ServiceDeskPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = th.desk;
  const user = await getCurrentUser();
  const role = user.role as Role;
  const tab = parseTab(sp.tab);
  const type = parseType(sp.type);
  const channel = sp.channel?.trim() || undefined;
  const [all, usedChannels] = await Promise.all([loadQueue(), queueChannels()]);
  const base = { type, channel, meId: user.id };
  const rows = filterQueue(all, { ...base, tab });
  const counts = tabCounts(all, base);
  const manage = can(role, 'servicedesk.manage');
  const staff = manage ? await staffUsers() : [];
  const channels = [...new Set([...DESK_CHANNELS, ...usedChannels])];
  const href = (k: QueueTab) => {
    const q = new URLSearchParams();
    if (k !== 'all') q.set('tab', k);
    if (type !== 'all') q.set('type', type);
    if (channel) q.set('channel', channel);
    const s = q.toString();
    return `/service-desk${s ? `?${s}` : ''}`;
  };

  const columns: Column<QueueItem>[] = [
    { key: 'type', header: t.colType, hideOnSmall: true, render: (r) => <StatusBadge tone={r.kind === 'INC' ? 'accent' : 'neutral'} className="text-xs">{t.typeBadge[r.kind]}</StatusBadge> },
    { key: 'id', header: t.colId, render: (r) => <Link href={r.href} className="inline-flex min-h-[44px] items-center font-mono text-[12px]">{r.docNo}</Link> },
    {
      key: 'title', header: t.colTitle,
      render: (r) => (
        <span className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{r.title}</span>
            {r.isMajor && <StatusBadge tone="critical" className="text-xs">{t.major}</StatusBadge>}
            {r.risk && <StatusBadge tone={r.risk === 'BREACHED' ? 'critical' : 'warn'} className="text-xs">{t.risk[r.risk]}</StatusBadge>}
          </span>
          <span className="text-xs text-muted">{thDateShort(r.createdAt)} {thTime(r.createdAt)}</span>
          {/* มือถือ: ย้ายความสำคัญ/สถานะมาไว้ใต้หัวเรื่อง (คอลัมน์แยกถูกซ่อน เพื่อไม่ให้ตารางกว้างเกินจอ) */}
          <span className="flex flex-wrap items-center gap-1.5 md:hidden">
            {r.priority && <PriorityChip priority={r.priority} />}
            <span className="text-xs">{r.kind === 'INC' ? th.incidentStatus[r.status as IncidentStatus] : t.requestStatus[r.status as keyof typeof t.requestStatus]}</span>
          </span>
        </span>
      ),
    },
    { key: 'who', header: t.colWho, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.who ?? '—'}</span> },
    { key: 'channel', header: t.colChannel, hideOnSmall: true, render: (r) => <span className="text-[13px]">{r.channel ?? '—'}</span> },
    { key: 'owner', header: t.colOwner, hideOnSmall: true, render: (r) => (r.kind === 'REQ' ? <span className="text-[13px] text-muted">—</span> : <span className="text-[13px]">{r.assigneeName ?? <span className="font-semibold text-warn-fg">{t.unassigned}</span>}</span>) },
    {
      key: 'status', header: t.colStatus, hideOnSmall: true,
      render: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {r.priority && <PriorityChip priority={r.priority} />}
          <span className="text-xs">{r.kind === 'INC' ? th.incidentStatus[r.status as IncidentStatus] : t.requestStatus[r.status as keyof typeof t.requestStatus]}</span>
        </span>
      ),
    },
    {
      key: 'action', header: t.colAction,
      render: (r) => {
        if (r.kind !== 'INC') return <span className="text-xs text-muted">—</span>;
        return (
          <span className="flex flex-col items-stretch gap-1.5 md:flex-row md:flex-wrap md:items-center">
            {r.unassigned && (
              <form action={claimAction.bind(null, r.id)}>
                <button type="submit" aria-label={`${t.claim} ${r.docNo}`} className={cx(btn, 'font-semibold')}>{t.claim}</button>
              </form>
            )}
            {manage && (
              <form action={assignAction.bind(null, r.id)} className="flex flex-col gap-1 md:flex-row md:items-center">
                <label className="sr-only" htmlFor={`as-${r.id}`}>{t.assignTo} {r.docNo}</label>
                <select id={`as-${r.id}`} name="assigneeId" defaultValue="" className={cx(control, 'w-full min-w-0 md:max-w-[150px]')}>
                  <option value="" disabled>{t.assignTo}</option>
                  {staff.filter((s) => s.id !== r.assigneeId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="submit" aria-label={`${t.assignBtn} ${r.docNo}`} className={btn}>{t.assignBtn}</button>
              </form>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader breadcrumb={t.breadcrumb} title={t.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label={t.tabsAria} className="flex flex-wrap gap-1.5">
            {(Object.keys(t.tabs) as QueueTab[]).map((k) => (
              <Link key={k} href={href(k)} aria-current={tab === k ? 'page' : undefined}
                className={cx('inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm no-underline', tab === k ? 'border-ink bg-ink text-white hover:text-white' : 'border-input bg-surface text-ink hover:text-ink')}>
                {t.tabs[k]} <span className="font-mono text-xs" data-testid={`count-${k}`}>{counts[k]}</span>
              </Link>
            ))}
          </nav>
          <span className="grow" />
          {manage && <Link href="/service-desk/rules" className="inline-flex min-h-11 items-center text-sm">{t.rulesLink}</Link>}
          {manage && <Link href="/service-desk/macros" className="inline-flex min-h-11 items-center text-sm">{t.macrosLink}</Link>}
          {can(role, 'incident.manage') && (
            <Link href="/service-desk/new" className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-sm font-semibold text-white no-underline hover:bg-accent-hover hover:text-white">{t.logBtn}</Link>
          )}
        </div>

        <form method="get" action="/service-desk" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          {tab !== 'all' && <input type="hidden" name="tab" value={tab} />}
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterType}
            <select name="type" defaultValue={type === 'all' ? '' : type} className={control}>
              <option value="">{t.allTypes}</option>
              <option value="INC">{t.typeInc}</option>
              <option value="REQ">{t.typeReq}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">{t.filterChannel}
            <select name="channel" defaultValue={channel ?? ''} className={control}>
              <option value="">{t.allChannels}</option>
              {channels.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.apply}</button>
          <Link href="/service-desk" className="inline-flex h-11 items-center px-2 text-sm">{th.common.reset}</Link>
        </form>

        <Card>
          <span className="text-sm text-muted" aria-live="polite">{t.total(rows.length)}</span>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} empty={t.empty} gridClass="grid-cols-[88px_minmax(0,1fr)_104px] md:grid-cols-[84px_100px_minmax(0,2fr)_minmax(0,1fr)_100px_minmax(0,1fr)_150px_minmax(0,1.3fr)]" />
        </Card>
      </div>
    </>
  );
}
