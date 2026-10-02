import { thDateTime } from '@/lib/datetime';

export interface ActivityItem {
  id: string;
  at: Date;
  text: string;
  user: { name: string } | null;
}

export function ActivityLog({ items, empty }: { items: ActivityItem[]; empty: string }) {
  if (items.length === 0) return <p className="m-0 text-sm text-muted">{empty}</p>;
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {items.map((a) => (
        <li key={a.id} className="grid grid-cols-[14px_minmax(0,1fr)] gap-3 border-t border-divider py-2.5 first:border-t-0">
          <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold">
              {a.user?.name ?? 'ระบบ'} <span className="font-normal text-muted">· {thDateTime(a.at)}</span>
            </span>
            <span className="whitespace-pre-line text-sm leading-relaxed">{a.text}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
