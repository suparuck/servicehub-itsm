import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { Card, StatusBadge } from '@/components/ui';
import { th } from '@/i18n/th';
import { getCurrentUser } from '@/lib/currentUser';
import { NAV, flatNav } from '@/lib/nav';
import { placeholderFor } from '@/lib/placeholders';

export const dynamic = 'force-dynamic';

// โมดูลที่ยังไม่พัฒนา: แสดงขอบเขตตาม ITIL 4 และทางไปยังส่วนที่ใช้งานได้แล้ว (ไม่มีข้อมูลสมมติ) · พาธอื่นที่ไม่อยู่ในเมนู = 404
export default async function Placeholder({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = '/' + slug.join('/');
  const info = placeholderFor(path);
  const item = info && flatNav.find((n) => n.href === info.href);
  if (!info || !item) notFound();
  // พาธย่อย (เช่น /assets/xyz) ยังไม่มีอยู่จริง — ไม่ตอบเป็นหน้าโมดูลเพื่อไม่ให้ดูเหมือนมีรายการนั้น
  if (path !== info.href) notFound();
  const user = await getCurrentUser();
  const t = th.placeholder;
  const group = NAV.find((g) => g.items.some((n) => n.href === item.href))?.group ?? '';

  return (
    <>
      <PageHeader breadcrumb={`${group} › ${info.practice}`} title={item.label} initials={user.initials} />
      <div className="box-border flex w-full max-w-[860px] flex-col gap-4 px-7 pb-10 pt-6">
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-card border border-warn bg-warn-tint px-4 py-3 text-sm text-warn-fg">
          <StatusBadge tone="warn">{t.statusBadge}</StatusBadge>
          <span>{t.notice}</span>
        </div>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.practiceTitle}: {info.practice}</h2>
          <p className="m-0 text-sm">{info.summary}</p>
        </Card>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.plannedTitle}</h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm" data-testid="planned">
            {info.planned.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <p className="m-0 text-xs text-muted">{t.noDate}</p>
        </Card>

        <Card className="gap-2 p-5">
          <h2 className="m-0 text-[17px] font-semibold">{t.relatedTitle}</h2>
          <ul className="m-0 flex list-none flex-col p-0" data-testid="related">
            {info.related.map((r) => (
              <li key={r.href} className="flex flex-wrap items-center gap-x-3 border-b border-divider py-1 last:border-b-0">
                <Link href={r.href} className="inline-flex min-h-11 items-center text-sm font-semibold">{r.label}</Link>
                <span className="text-xs text-muted">{r.note}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Link href="/" className="inline-flex min-h-[44px] items-center self-start">{t.back}</Link>
      </div>
    </>
  );
}
