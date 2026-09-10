import type { CurrentAction } from "../../_lib/derive-current-actions";

export function CurrentActionQueue({ actions, onNavigate }: { actions: CurrentAction[]; onNavigate: (href: string) => void }) {
  const visible = actions.slice(0, 3);
  return <section className="my-2 rounded-lg border border-blue-100 bg-blue-50/70 p-2"><h2 className="text-xs font-bold text-blue-900">지금 해야 할 일</h2>{visible.length > 0 ? <div className="mt-1 space-y-1">{visible.map((action) => <article key={action.id} className="flex h-9 items-center justify-between gap-3 rounded-md bg-white px-3"><p className="min-w-0 truncate text-xs font-semibold text-slate-700">{action.title} <span className="font-normal text-slate-400">· {action.status}</span></p><button type="button" onClick={() => onNavigate(action.href)} className="whitespace-nowrap rounded border border-blue-400 px-3 py-1 text-[11px] font-semibold text-blue-700">검토 열기</button></article>)}</div> : <div className="mt-1 rounded-md bg-white px-3 py-2"><p className="text-xs font-semibold text-slate-700">현재 확인 가능한 검토 작업이 없습니다.</p><p className="mt-1 text-[10px] text-slate-500">실제 Case 데이터가 연결되면 검토가 필요한 업무가 표시됩니다.</p></div>}</section>;
}
