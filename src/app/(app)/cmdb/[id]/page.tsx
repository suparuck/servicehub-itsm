import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge, cx } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCiDetail, getOwnerOptions } from '@/lib/cmdbQueries';
import { getCurrentUser } from '@/lib/currentUser';
import { thDate, thDateShort, thDayMonthTime } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { can, type Role } from '@/lib/permissions';
import { addRelationshipAction, removeRelationshipAction, verifyCiAction } from '../actions';

export const dynamic = 'force-dynamic';

const NODE: Record<'sel' | 'hit' | 'plain', string> = {
  sel: 'border-2 border-ink bg-surface shadow-[0_0_0_3px_rgba(31,79,216,0.2)]',
  hit: 'border border-critical-line bg-critical-soft',
  plain: 'border border-border bg-surface',
};
const btn = 'inline-flex h-11 items-center rounded-control border border-input bg-surface px-4 text-sm text-ink no-underline hover:text-ink';
const field = 'box-border min-h-11 rounded-control border border-input bg-surface px-3 text-sm';
const ATTR_LABEL: Record<string, string> = { userCount: 'ผู้ใช้ (คน)', slaTarget: 'เป้าหมาย SLA' };

export default async function CiDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const [user, detail, opts] = await Promise.all([getCurrentUser(), getCiDetail(decodeURIComponent(id)), getOwnerOptions()]);
  if (!detail) notFound();
  const { ci, tiers, impact, openInc, problems, pendingChanges, kb } = detail;
  const t = th.cmdb;
  const hasP1 = openInc.some((i) => i.priority === 'P1');
  const canEdit = can(user.role as Role, 'cmdb.manage');

  const owner = ci.ownerUser?.name ?? ci.ownerGroup?.name ?? ci.ownerLabel;
  const stored = (ci.attributes ?? {}) as Record<string, unknown>;
  const fixed: [string, string][] = ([
    [t.attrFixed.owner, owner ? (ci.ownerUser && ci.ownerGroup ? `${ci.ownerGroup.name} · ${ci.ownerUser.name}` : owner) : th.cmdb.noOwner],
    [t.attrFixed.lifecycle, t.lifecycle[ci.lifecycle]],
    ...(ci.lastDiscoveredAt ? [[t.attrFixed.discovered, thDayMonthTime(ci.lastDiscoveredAt)] as [string, string]] : []),
    ...(ci.lastVerifiedAt ? [[t.attrFixed.verified, thDate(ci.lastVerifiedAt)] as [string, string]] : []),
    ...(ci.asset ? [[t.attrFixed.asset, ci.asset.assetTag] as [string, string]] : []),
  ] as [string, string][]).filter(([k]) => !(k in stored));
  const attrs: [string, string][] = [...Object.entries(stored).map(([k, v]) => [ATTR_LABEL[k] ?? k, String(v)] as [string, string]), ...fixed];

  const cols = tiers.flatMap((_, i) => (i === 0 ? ['minmax(0,1fr)'] : ['28px', 'minmax(0,1fr)'])).join(' ');
  const relRows = [
    ...ci.outgoing.map((r) => ({ id: r.id, dir: 'out' as const, type: r.type, other: r.target })),
    ...ci.incoming.map((r) => ({ id: r.id, dir: 'in' as const, type: r.type, other: r.source })),
  ];

  return (
    <>
      <PageHeader
        breadcrumb={<><Link href="/">แดชบอร์ด</Link> › <Link href="/cmdb">{t.detailBreadcrumb}</Link> › {ci.ciId}</>}
        title={ci.name}
        initials={user?.initials ?? '··'}
      />
      <div className="box-border flex w-full max-w-[1400px] flex-col gap-4 px-7 pb-10 pt-6">
        <Link href="/cmdb" className="inline-flex min-h-[44px] items-center self-start text-sm">{t.back}</Link>
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}

        <Card className="gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted"><span className="font-mono">{ci.ciId}</span> · {ci.classLabel ?? t.classes[ci.ciClass]} · {t.envs[ci.environment as keyof typeof t.envs] ?? ci.environment}</span>
              <h2 className="m-0 text-[22px] font-semibold">{ci.name}</h2>
              {ci.subtitle && <span className="text-sm text-muted">{ci.subtitle}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={ci.lifecycle === 'LIVE' ? 'ok' : ci.lifecycle === 'MAINTENANCE' ? 'warn' : ci.lifecycle === 'PLANNED' ? 'accent' : 'neutral'} className="px-2.5 py-1 text-xs">{t.lifecycle[ci.lifecycle]}</StatusBadge>
              {hasP1 ? <StatusBadge tone="critical" className="px-2.5 py-1 text-xs">{t.badgeP1}</StatusBadge> : openInc.length > 0 && <StatusBadge tone="warn" className="px-2.5 py-1 text-xs">{t.badgeIncident}</StatusBadge>}
              {pendingChanges.length > 0 && <StatusBadge tone="warn" className="px-2.5 py-1 text-xs">{t.badgeChange}</StatusBadge>}
              {ci.driftNote && <StatusBadge tone="warn" className="px-2.5 py-1 text-xs">{t.badgeDrift}</StatusBadge>}
              {canEdit && <Link href={`/cmdb/${ci.ciId}/edit`} className={btn}>{t.edit}</Link>}
              {canEdit && <form action={verifyCiAction.bind(null, ci.ciId)}><button type="submit" className={btn}>{t.verify}</button></form>}
            </div>
          </div>
          {ci.driftNote && <p className="m-0 rounded-control bg-warn-tint px-3 py-2 text-sm text-warn-fg">{ci.driftNote}</p>}

          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2.5">
              <h3 className="m-0 text-[15px] font-semibold">{t.mapTitle}</h3>
              <span className="text-xs text-muted">{t.mapLegend}</span>
            </div>
            {tiers.length <= 1 ? (
              <p className="m-0 rounded-card bg-subtle p-4 text-sm text-muted">{t.mapNone}</p>
            ) : (
              <div className="grid grid-cols-1 items-center gap-1.5 rounded-card bg-subtle p-4 md:[grid-template-columns:var(--cols)]" style={{ '--cols': cols } as CSSProperties}>
                {tiers.map((tier, i) => (
                  <TierColumn key={tier.label} first={i === 0} label={t.tiers[tier.label]} nodes={tier.nodes} />
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-2.5">
              <h3 className="m-0 text-[15px] font-semibold">{t.attrsTitle}</h3>
              {attrs.length === 0 && <p className="m-0 text-sm text-muted">{t.attrsNone}</p>}
              <dl className="m-0 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {attrs.map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5 rounded-control bg-subtle px-3 py-2">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="m-0 text-sm font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mb-0 mt-2 text-[15px] font-semibold">{t.historyTitle}</h3>
              {ci.history.length === 0 && <p className="m-0 text-sm text-muted">{t.historyNone}</p>}
              {ci.history.map((h) => (
                <div key={h.id} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2.5 border-t border-divider py-2 text-[13px]">
                  <span className="font-mono text-muted">{thDateShort(h.at)}</span>
                  <span><span className="font-semibold">{h.what}</span> <span className="text-muted">· {h.source}</span></span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2.5 rounded-card bg-sidebar p-4 text-[#F2F3F0]">
                <h3 className="m-0 text-[15px] font-semibold">{t.impactTitle}</h3>
                <span className="text-xs text-[#A9AFB9]">{t.impactSub}</span>
                {[
                  [t.impactBs, String(impact.businessServices)],
                  [t.impactApp, String(impact.applications)],
                  ...(impact.others ? [[t.impactOther, String(impact.others)]] : []),
                  [t.impactUsers, impact.users ? `≈ ${impact.users.toLocaleString('en-US')}` : '—'],
                  [t.impactSla, impact.sla.length ? impact.sla.join(', ') : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2.5 border-t border-[#343A42] py-1.5 text-sm">
                    <span>{k}</span>
                    <span className="text-right font-mono font-semibold">{v}</span>
                  </div>
                ))}
              </div>

              <Card className="gap-1 p-4">
                <h3 className="m-0 mb-1 text-[15px] font-semibold">{t.linksTitle}</h3>
                {openInc.length + problems.length + pendingChanges.length + kb.length === 0 && !ci.asset && <p className="m-0 text-sm text-muted">{t.linksNone}</p>}
                {openInc.map((i) => <Link key={i.id} href={`/incidents/${formatDocNo('INC', i.seq)}`} className="inline-flex min-h-[44px] items-center text-sm">{formatDocNo('INC', i.seq)} · {i.title} ({i.priority})</Link>)}
                {problems.map((p) => <Link key={p.id} href="/problems" className="inline-flex min-h-[44px] items-center text-sm">{formatDocNo('PRB', p.seq)} · {p.title}</Link>)}
                {pendingChanges.map((c) => <Link key={c.id} href="/changes" className="inline-flex min-h-[44px] items-center text-sm">{formatDocNo('CHG', c.seq)} · {th.changeType[c.type]}</Link>)}
                {kb.map((a) => <Link key={a.id} href={`/knowledge/${formatDocNo('KB', a.seq)}`} className="inline-flex min-h-[44px] items-center text-sm">{formatDocNo('KB', a.seq)} · {a.title}</Link>)}
                {ci.asset && <span className="inline-flex flex-wrap items-center gap-x-1 text-sm"><Link href={`/assets/${ci.asset.assetTag}`} className="inline-flex min-h-[44px] items-center">{ci.asset.assetTag}</Link> · สินทรัพย์ (ITAM){ci.asset.supportUntil ? ` · สัญญา MA ถึง ${thDate(ci.asset.supportUntil)}` : ''}</span>}
              </Card>
            </div>
          </div>
        </Card>

        <Card className="gap-3 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.relTitle}</h2>
          {relRows.length === 0 && <p className="m-0 text-sm text-muted">{t.relNone}</p>}
          {relRows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-divider py-1.5 text-sm">
              <span>
                <span className="text-muted">{r.dir === 'out' ? t.relOut : t.relIn} · {t.relTypes[r.type]} · </span>
                <Link href={`/cmdb/${r.other.ciId}`} className="inline-flex min-h-[44px] items-center font-medium">{r.other.name}</Link>
              </span>
              {canEdit && (
                <form action={removeRelationshipAction.bind(null, ci.ciId, r.id)}>
                  <button type="submit" aria-label={`${t.relRemove} ${r.other.name}`} className="h-11 rounded-control border border-input bg-surface px-4 text-sm text-critical-fg">{t.relRemove}</button>
                </form>
              )}
            </div>
          ))}
          {canEdit && (
          <form action={addRelationshipAction.bind(null, ci.ciId)} className="flex flex-wrap items-end gap-3 border-t border-divider pt-3">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[13px] text-muted">{t.relType}
              <select name="type" className={cx(field)} defaultValue="DEPENDS_ON">
                {(Object.keys(t.relTypes) as (keyof typeof t.relTypes)[]).map((k) => <option key={k} value={k}>{t.relTypes[k]}</option>)}
              </select>
            </label>
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{t.relTarget}
              <select name="target" required className={field} defaultValue="">
                <option value="" disabled>{th.cmdb.form.none}</option>
                {opts.cis.filter((c) => c.id !== ci.id).map((c) => <option key={c.id} value={c.ciId}>{c.name} ({c.ciId})</option>)}
              </select>
            </label>
            <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.relAdd}</button>
          </form>
          )}
        </Card>
      </div>
    </>
  );
}

function TierColumn({ first, label, nodes }: { first: boolean; label: string; nodes: { id: string; ciId: string; name: string; sub: string; kind: 'sel' | 'hit' | 'plain' }[] }) {
  return (
    <>
      {!first && <span aria-hidden="true" className="rotate-90 justify-self-center text-xl text-muted md:rotate-0">→</span>}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-[0.04em] text-muted">{label}</span>
        {nodes.map((n) => (
          <Link key={n.id} href={`/cmdb/${n.ciId}`} aria-current={n.kind === 'sel' ? 'true' : undefined}
            className={cx('flex min-h-[44px] flex-col gap-0.5 rounded-control px-3 py-2.5 text-ink no-underline hover:text-ink', NODE[n.kind])}>
            <span className="text-[13px] font-semibold">{n.name}</span>
            <span className="text-[11px] text-muted">{n.sub}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
