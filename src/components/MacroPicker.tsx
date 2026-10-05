'use client';

import { useState } from 'react';
import { th } from '@/i18n/th';
import { renderMacro } from '@/lib/serviceDesk';

/** เลือกข้อความสำเร็จรูปแล้วแทรกลงในช่องโน้ต (textarea ที่ระบุด้วย targetId) — แทนตัวแปรด้วยข้อมูลของ Incident นี้ ณ ตอนแทรก */
export function MacroPicker({ macros, targetId, vars }: { macros: { id: string; title: string; body: string }[]; targetId: string; vars: { ชื่อ: string | null; เลขที่: string; เจ้าหน้าที่: string | null } }) {
  const [id, setId] = useState('');
  if (macros.length === 0) return null;
  const m = th.desk.macros;
  const insert = () => {
    const macro = macros.find((x) => x.id === id);
    const el = document.getElementById(targetId) as HTMLTextAreaElement | null;
    if (!macro || !el) return;
    const text = renderMacro(macro.body, vars);
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = `${el.value.slice(0, start)}${text}${el.value.slice(end)}`;
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
    setId('');
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] text-muted">{m.pickLabel}
        <select value={id} onChange={(e) => setId(e.target.value)} className="box-border h-11 w-full rounded-control border border-input bg-surface px-3 text-sm text-ink">
          <option value="">{m.pickNone}</option>
          {macros.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
      </label>
      <button type="button" onClick={insert} disabled={!id} className="h-11 rounded-control border border-input bg-surface px-4 text-sm disabled:opacity-50">{m.insert}</button>
    </div>
  );
}
