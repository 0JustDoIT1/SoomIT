import type { CurrentAction } from "../../_lib/derive-current-actions";

export function CurrentActionQueue({ actions, onNavigate, onOpen }: { actions: CurrentAction[]; onNavigate: (href: string) => void; onOpen?: (action: CurrentAction) => void }) {
  const visible = actions.slice(0, 3);
  return <section className="shrink-0 border-y border-blue-100 bg-blue-50/60 px-3 py-1.5" aria-label="지금 해야 할 일">
    <div className="flex items-center gap-2 overflow-x-auto">
      <div className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white"><p>지금 해야 할 일</p><p className="mt-0.5 text-[9px] font-medium text-blue-100">완료 조건을 확인하세요</p></div>
      {visible.length ? <div className="flex min-w-0 flex-1 gap-2">{visible.map((action, index) => <button key={action.id} type="button" aria-label="검토 열기" title={action.title} onClick={() => { if (onOpen) onOpen(action); else onNavigate(action.href); }} className="flex min-w-[230px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">{index + 1}</span>
        <span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-800">{action.title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500"><span className={getSourceStyle(action.source)}>{action.sourceLabel}</span> · {action.status}</span><span className="mt-1 block truncate text-[10px] font-medium text-slate-600">완료 조건: {completionCondition(action)}</span></span>
        <span aria-hidden="true" className="ml-auto text-blue-600">›</span>
      </button>)}</div> : <div className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700"><p>현재 확인 가능한 검토 작업이 없습니다.</p><p className="mt-1 text-[10px] font-medium text-slate-500">다음 검사 또는 결과 입력을 기다리고 있습니다.</p></div>}
    </div>
  </section>;
}

function completionCondition(action: CurrentAction) {
  if (action.source === "AI") return "AI 후보를 확인하고 전문의 소견을 입력";
  if (action.source === "SPECIALIST") return "확정 소견과 다음 진료 단계를 확인";
  if (action.source === "ORDER") return "검사 완료 후 원본 영상 또는 결과가 연결됨";
  return "처방 상태와 안전성 검토를 확인";
}

function getSourceStyle(source: CurrentAction["source"]) {
  if (source === "SPECIALIST") return "rounded bg-emerald-50 px-1 text-emerald-700";
  if (source === "AI") return "rounded bg-blue-50 px-1 text-blue-700";
  if (source === "PRESCRIPTION") return "rounded bg-violet-50 px-1 text-violet-700";
  return "rounded bg-slate-100 px-1 text-slate-700";
}
