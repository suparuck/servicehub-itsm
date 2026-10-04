import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityLog } from '@/components/ActivityLog';
import { ImpFormFields } from '@/components/ImpFormFields';
import { PageHeader } from '@/components/PageHeader';
import { StepTracker } from '@/components/StepTracker';
import { Card, StatusBadge, type Tone } from '@/components/ui';
import { th } from '@/i18n/th';
import { getAudit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/currentUser';
import { thDateShort } from '@/lib/datetime';
import { formatDocNo } from '@/lib/docno';
import { isOverdue, nextImpStatuses, STEP_COUNT, type ImpStatus } from '@/lib/improvement';
import { formOptions, getImprovement } from '@/lib/improvementService';
import { can, type Role } from '@/lib/permissions';
import { changeStatusAction, moveStepAction, updateImprovementAction } from '../actions';

export const dynamic = 'force-dynamic';
const field = 'box-border w-full rounded-control border border-input bg-surface px-3 text-sm min-h-11';
const STATUS_TONE: Record<ImpStatus, Tone> = { OPEN: 'accent', ON_HOLD: 'warn', DONE: 'ok', CANCELLED: 'neutral' };

export default async function ImprovementDetail({ params, searchParams }: { params: Promise<{ no: string }>; searchParams: Promise<{ error?: string }> }) {
  const { no } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const it = await getImprovement(decodeURIComponent(no));
  if (!it) notFound();
  const [options, activity] = await Promise.all([formOptions(), getAudit('IMPROVEMENT', it.id)]);
  const manage = can(user.role as Role, 'improvement.manage');
  const t = th.improvement;
  const docNo = formatDocNo('IMP', it.seq);
  const closed = it.status === 'DONE' || it.status === 'CANCELLED';
  const editable = manage && !closed;
  const overdue = isOverdue(it);
  const statusNext = nextImpStatuses(it.status);
  const stepChoices = Array.from({ length: STEP_COUNT }, (_, i) => i + 1).filter((n) => n !== it.step && n <= it.step + 1);

  return (
    <>
      <PageHeader breadcrumb={<><Link href="/improvement">{t.title}</Link> › {docNo}</>} title={it.title} initials={user.initials} />
      <div className="box-border flex w-full max-w-[1000px] flex-col gap-4 px-7 pb-10 pt-6">
        {sp.error && <div role="alert" className="rounded-control border border-critical-line bg-critical-soft px-3 py-2.5 text-sm text-critical-fg">{sp.error}</div>}
        {closed && <div role="status" className="rounded-control border border-border bg-subtle px-3 py-2.5 text-sm">{t.closedNote}</div>}

        <Card className="gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm text-muted">{docNo}</span>
            <StatusBadge tone={STATUS_TONE[it.status]} className="px-2.5 py-1 text-xs">{t.status[it.status]}</StatusBadge>
            <span className="text-sm text-muted">{t.benefit[it.benefit]}</span>
            {it.targetDate && <span className="text-sm text-muted">{t.form.target}: {thDateShort(it.targetDate)}</span>}
            {overdue && <StatusBadge tone="critical">{t.overdue}</StatusBadge>}
            {it.problem && <Link href={`/problems/${formatDocNo('PRB', it.problem.seq)}`} className="inline-flex min-h-11 items-center text-sm">{t.linkedProblem}: {formatDocNo('PRB', it.problem.seq)}</Link>}
            {it.service && <Link href={`/catalogue/${it.service.code}`} className="inline-flex min-h-11 items-center text-sm">{t.linkedService}: {it.service.name}</Link>}
          </div>
          <StepTracker step={it.step} done={it.status === 'DONE'} />
        </Card>

        <Card className="p-5">
          <form action={updateImprovementAction.bind(null, it.seq)} className="flex flex-col gap-3">
            <fieldset disabled={!editable} className="m-0 flex flex-col gap-3 border-0 p-0">
              <ImpFormFields d={it} options={options} />
              {editable && <button type="submit" className="h-11 self-start rounded-control bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover">{t.form.save}</button>}
            </fieldset>
          </form>
        </Card>

        {editable && it.status === 'OPEN' && ( // เปลี่ยนขั้นได้เฉพาะรายการที่กำลังดำเนินการ (service ปฏิเสธอยู่แล้ว ไม่แสดงปุ่มที่ใช้ไม่ได้)
          <Card className="gap-2 p-5">
            <h2 className="m-0 text-[17px] font-semibold">{t.moveTitle}</h2>
            <form action={moveStepAction.bind(null, it.seq)} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1.4fr_1.6fr_auto]">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.moveTo}
                <select name="to" defaultValue={Math.min(it.step + 1, STEP_COUNT)} className={field}>
                  {stepChoices.map((n) => <option key={n} value={n}>{n}. {th.dashboard.improveSteps[n - 1]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.moveNote}<input name="note" maxLength={300} className={field} /></label>
              <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.moveSubmit}</button>
            </form>
            <span className="text-xs text-muted">{t.moveHint}</span>
          </Card>
        )}

        {manage && statusNext.length > 0 && (
          <Card className="gap-2 p-5">
            <h2 className="m-0 text-[17px] font-semibold">{t.statusTitle}</h2>
            <form action={changeStatusAction.bind(null, it.seq)} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_2fr_auto]">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.statusTo}
                <select name="to" className={field}>{statusNext.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}</select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">{t.statusReason}<input name="reason" maxLength={300} className={field} /></label>
              <button type="submit" className="h-11 rounded-control bg-ink px-5 text-sm font-semibold text-white">{t.statusSubmit}</button>
            </form>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.activity}</h2>
          <ActivityLog items={activity} empty={th.common.activityNone} />
        </Card>
        <Link href="/improvement" className="inline-flex min-h-[44px] items-center self-start">{t.back}</Link>
      </div>
    </>
  );
}
