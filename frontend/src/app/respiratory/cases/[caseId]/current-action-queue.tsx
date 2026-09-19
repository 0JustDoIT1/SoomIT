import type { CurrentAction } from "../../_lib/derive-current-actions";

export function CurrentActionQueue({ actions, onNavigate, onOpen }: { actions: CurrentAction[]; onNavigate: (href: string) => void; onOpen?: (action: CurrentAction) => void }) {
  const visible = actions.slice(0, 3);

  return (
    <section className="shrink-0 rounded-lg border border-blue-100 bg-[#f8fbff] px-2 py-1" aria-label="지금 해야 할 일">
      <div className="flex items-stretch gap-2 overflow-x-auto">
        <div className="flex min-w-[112px] shrink-0 flex-col justify-center rounded-md bg-blue-600 px-2.5 py-1.5 text-white">
          <p className="text-[11px] font-bold">지금 해야 할 일</p>
          <p className="mt-0.5 text-[9px] font-medium text-blue-100">Case 전체 업무</p>
        </div>
        {visible.length ? (
          <div className="flex min-w-0 flex-1 gap-2">
            {visible.map((action, index) => (
              <button
                key={action.id}
                type="button"
                aria-label="검토 열기"
                title={action.title}
                onClick={() => { if (onOpen) onOpen(action); else onNavigate(action.href); }}
                className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-left transition hover:border-blue-300 hover:bg-blue-50"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold text-slate-800">{action.title}</span>
                  <span className="mt-0.5 block truncate text-[9px] text-slate-500"><span className={getSourceStyle(action.source)}>{action.sourceLabel}</span> · {action.status}</span>
                  <span className="sr-only">완료 조건: {completionCondition(action)}</span>
                </span>
                <span aria-hidden="true" className="ml-auto text-blue-600">›</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-w-[300px] items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
            현재 확인 가능한 검토 작업이 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}

function completionCondition(action: CurrentAction) {
  if (action.source === "ORDER" && action.status.startsWith("예약 확정")) return "예약된 검사 완료 후 결과가 연결됩니다.";
  if (action.source === "ORDER" && action.status.startsWith("예약 요청")) return "환자 예약 확정 및 검사 완료를 확인합니다.";
  if (action.source === "AI") return "AI 후보를 검토하고 전문의 소견을 입력합니다.";
  if (action.source === "SPECIALIST") return "확정 소견과 다음 진료 단계를 결정합니다.";
  if (action.source === "ORDER") return "검사 완료 후 원본 영상 또는 결과가 연결됩니다.";
  return "처방 상태와 안전성 검토를 확인합니다.";
}

function getSourceStyle(source: CurrentAction["source"]) {
  if (source === "SPECIALIST") return "rounded bg-emerald-50 px-1 text-emerald-700";
  if (source === "AI") return "rounded bg-blue-50 px-1 text-blue-700";
  if (source === "PRESCRIPTION") return "rounded bg-violet-50 px-1 text-violet-700";
  return "rounded bg-slate-100 px-1 text-slate-700";
}
