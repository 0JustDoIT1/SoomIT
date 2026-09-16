import { type ReactNode, useState } from "react";
import type { CurrentAction } from "../../_lib/derive-current-actions";

export function CurrentActionQueue({ actions, onNavigate, onOpen, renderExpanded }: { actions: CurrentAction[]; onNavigate: (href: string) => void; onOpen?: (action: CurrentAction) => void; renderExpanded?: (action: CurrentAction) => ReactNode }) {
  const visible = actions.slice(0, 3);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return <section className="my-2 rounded-lg border border-blue-100 bg-blue-50/70 p-2">
    <h2 className="text-xs font-bold text-blue-900">지금 해야 할 일</h2>
    {visible.length ? <div className="mt-1 space-y-1">{visible.map((action) => <article key={action.id} className="overflow-hidden rounded-md bg-white">
      <div className="flex h-9 items-center justify-between gap-3 px-3"><div className="flex min-w-0 items-center gap-2"><span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold ${getSourceStyle(action.source)}`}>{action.sourceLabel}</span><p className="min-w-0 truncate text-xs font-semibold text-slate-700">{action.title} <span className="font-normal text-slate-400">· {action.status}</span></p></div><button type="button" aria-expanded={expandedId === action.id} onClick={() => { const next = expandedId === action.id ? null : action.id; setExpandedId(next); if (next) { if (onOpen) onOpen(action); else onNavigate(action.href); } }} className="whitespace-nowrap rounded border border-blue-400 px-3 py-1 text-[11px] font-semibold text-blue-700">{expandedId === action.id ? "검토 닫기" : "검토 열기"}</button></div>
      {expandedId === action.id && <div className="border-t border-blue-100 bg-slate-50 p-3">{renderExpanded ? renderExpanded(action) : <p className="text-xs text-slate-500">검토 내용을 불러오는 중입니다.</p>}</div>}
    </article>)}</div> : <div className="mt-1 rounded-md bg-white px-3 py-2"><p className="text-xs font-semibold text-slate-700">현재 확인할 검토 작업이 없습니다.</p></div>}
  </section>;
}

function getSourceStyle(source: CurrentAction["source"]) {
  if (source === "SPECIALIST") return "bg-emerald-50 text-emerald-700";
  if (source === "AI") return "bg-blue-50 text-blue-700";
  if (source === "PRESCRIPTION") return "bg-violet-50 text-violet-700";
  return "bg-amber-50 text-amber-700";
}
