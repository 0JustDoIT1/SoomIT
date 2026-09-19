import { deriveCurrentActions, type CurrentAction } from "../_lib/derive-current-actions";

const STAGES = ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "PRESCRIPTION"] as const;
const STAGE_LABELS: Record<(typeof STAGES)[number], string> = { XRAY: "흉부 X-ray", CT: "흉부 CT", PET_CT_TNM: "PET-CT / TNM", PATHOLOGY_GENE: "조직·유전자", PDL1: "PD-L1", TREATMENT: "치료결정", PRESCRIPTION: "처방" };

export type DashboardCase = { id: string; case_code: string; patient_name: string; patient_code: string; current_stage: string; case_status: string };
type ClinicalResult = { id?: string; workflow_stage: string; result_status?: string; result_status_label?: string; result_detail?: unknown };
type AiResult = { id?: string; analysis_type: string; status?: string; status_label?: string };
type Order = { id: string; order_type: string; order_type_label?: string; status: string; scheduled_at?: string | null; appointment_status?: string | null };
export type DashboardCaseSnapshot = { clinicalResults: ClinicalResult[]; aiResults: AiResult[]; orders: Order[] };
export type DashboardConsultation = { id: string; case_id: string; case_code: string; patient_name: string; status: string; priority: string; question: string };
export type DashboardQueueItem = { id: string; caseId: string; patient: string; stage: string; status: string; action: string };
type WorkGroup = { key: string; label: string; count: number; caseId: string; detail: string };

export function buildDashboardReviewQueue(cases: DashboardCase[], snapshots: Record<string, DashboardCaseSnapshot>, consultations: DashboardConsultation[]) {
  const rows: DashboardQueueItem[] = [];
  for (const caseItem of cases) {
    const snapshot = snapshots[caseItem.id];
    if (!snapshot || caseItem.case_status !== "ACTIVE") continue;
    const stageClinical = snapshot.clinicalResults.find((result) => result.workflow_stage === caseItem.current_stage);
    const stageAi = snapshot.aiResults.find((result) => result.analysis_type === `${caseItem.current_stage}_ANALYSIS` && result.status === "SUCCEEDED");
    const activeOrder = snapshot.orders.find((order) => order.order_type === caseItem.current_stage && ["ORDERED", "SCHEDULED"].includes(order.status));
    const base = { caseId: caseItem.id, patient: caseItem.patient_name || caseItem.patient_code, stage: STAGE_LABELS[caseItem.current_stage as keyof typeof STAGE_LABELS] || caseItem.current_stage };
    if (stageClinical?.result_status === "DRAFT") {
      const submitted = ["PATHOLOGY_GENE", "PDL1"].includes(caseItem.current_stage);
      rows.push({ ...base, id: `clinical-${caseItem.id}`, status: submitted ? "제출 완료" : "결과 저장", action: submitted ? "호흡기내과 확인 필요" : "확정 필요" });
    } else if (stageAi && stageClinical?.result_status !== "CONFIRMED") {
      rows.push({ ...base, id: `ai-${caseItem.id}`, status: "AI 분석 완료", action: "결과 검토 필요" });
    } else if (activeOrder) {
      rows.push({ ...base, id: `order-${caseItem.id}`, status: activeOrder.status === "SCHEDULED" ? "예약됨" : "오더 요청됨", action: "오더 확인" });
    }
  }
  consultations.filter((item) => ["REQUESTED", "ACKNOWLEDGED"].includes(item.status)).forEach((item) => rows.push({ id: `consultation-${item.id}`, caseId: item.case_id, patient: item.patient_name, stage: "협진", status: item.priority === "URGENT" ? "긴급 요청" : "응답 대기", action: "협진 응답" }));
  return rows;
}

export function buildDashboardWorkGroups(cases: DashboardCase[], snapshots: Record<string, DashboardCaseSnapshot>, consultations: DashboardConsultation[]) {
  const items: Array<{ kind: string; label: string; caseId: string; detail: string }> = [];
  for (const caseItem of cases) {
    const snapshot = snapshots[caseItem.id];
    if (!snapshot) continue;
    deriveCurrentActions(caseItem, snapshot.clinicalResults, snapshot.aiResults, [], snapshot.orders).forEach((action) => items.push({ ...classifyAction(action), caseId: caseItem.id, detail: action.status }));
  }
  consultations.filter((item) => ["REQUESTED", "ACKNOWLEDGED"].includes(item.status)).forEach((item) => items.push({ kind: "CONSULTATION", label: "협진 응답", caseId: item.case_id, detail: item.priority === "URGENT" ? "긴급" : "응답 대기" }));
  const groups = new Map<string, WorkGroup>();
  items.forEach((item) => { const current = groups.get(item.kind); groups.set(item.kind, current ? { ...current, count: current.count + 1 } : { key: item.kind, label: item.label, count: 1, caseId: item.caseId, detail: item.detail }); });
  return [...groups.values()];
}

function classifyAction(action: CurrentAction) {
  if (action.source === "ORDER") return { kind: "ORDER", label: "오더 확인" };
  if (action.source === "AI") return { kind: "AI", label: "결과 검토" };
  if (action.source === "PRESCRIPTION") return { kind: "PRESCRIPTION", label: "처방 확인" };
  return /DRAFT|저장|대기/.test(action.status) ? { kind: "CONFIRM", label: "확정 필요" } : { kind: "RESULT", label: "결과 확인" };
}

export function DashboardWorkQueues({ cases, snapshots, consultations, lastWorkedCase, unreadNotificationCount, onOpenCase, onOpenSchedules, onOpenConsultation, onOpenNotifications }: { cases: DashboardCase[]; snapshots: Record<string, DashboardCaseSnapshot>; consultations: DashboardConsultation[]; lastWorkedCase?: DashboardCase; unreadNotificationCount: number; onOpenCase: (caseId: string) => void; onOpenSchedules: () => void; onOpenConsultation: () => void; onOpenNotifications: () => void }) {
  const stageCounts = Object.fromEntries(STAGES.map((stage) => [stage, cases.filter((item) => item.case_status === "ACTIVE" && item.current_stage === stage).length]));
  const groups = buildDashboardWorkGroups(cases, snapshots, consultations);
  const visibleGroups = unreadNotificationCount > 0 ? [...groups, { key: "NOTIFICATION", label: "새 알림 확인", count: unreadNotificationCount, caseId: "", detail: "읽지 않은 알림" }] : groups;
  const queue = buildDashboardReviewQueue(cases, snapshots, consultations);
  return <>
    <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-bold text-slate-900">단계별 Case 현황</h2><p className="mt-0.5 text-[11px] text-slate-500">담당 ACTIVE Case의 현재 단계를 기준으로 집계합니다.</p></div><span className="text-xs text-slate-400">총 {cases.filter((item) => item.case_status === "ACTIVE").length}건</span></header><div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 xl:grid-cols-7 xl:divide-y-0">{STAGES.map((stage) => <div key={stage} className="min-w-0 px-3 py-3"><p className="truncate text-[10px] font-semibold text-slate-500">{STAGE_LABELS[stage]}</p><p className="mt-1 text-lg font-bold text-slate-900">{stageCounts[stage]}<span className="ml-1 text-[10px] font-medium text-slate-400">건</span></p></div>)}</div></section>
    <section className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]"><div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm"><header className="border-b border-blue-100 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">지금 할 일</h2><p className="mt-0.5 text-[11px] text-slate-500">현재 결과·AI·오더·협진 상태를 업무 유형별로 묶었습니다.</p></header>{visibleGroups.length ? <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">{visibleGroups.map((group) => <button key={group.key} type="button" onClick={() => group.key === "NOTIFICATION" ? onOpenNotifications() : onOpenCase(group.caseId)} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-700">{group.count}</span><span className="min-w-0"><span className="block text-xs font-bold text-slate-800">{group.label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{group.detail}</span></span><span className="ml-auto text-xs text-blue-700">열기</span></button>)}</div> : <p className="px-4 py-7 text-center text-xs text-slate-400">현재 확인 가능한 업무가 없습니다.</p>}</div><aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-sm font-bold text-slate-900">빠른 이동</h2><div className="mt-3 grid gap-2">{lastWorkedCase && <button type="button" onClick={() => onOpenCase(lastWorkedCase.id)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-left"><span className="block text-[10px] font-semibold text-blue-600">최근 Case 재개</span><span className="mt-1 block truncate text-xs font-bold text-blue-900">{lastWorkedCase.patient_name || lastWorkedCase.patient_code} · {lastWorkedCase.case_code}</span></button>}<button type="button" onClick={onOpenSchedules} className="rounded-lg border border-slate-200 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">일정 보기</button><button type="button" onClick={onOpenConsultation} className="rounded-lg border border-slate-200 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">협진 요청 · Case 선택</button></div></aside></section>
    <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-bold text-slate-900">검토 대기 Queue</h2><p className="mt-0.5 text-[11px] text-slate-500">Case별 가장 우선적인 검토 업무와 수신 협진을 표시합니다.</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{queue.length}건</span></header><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-2.5">환자</th><th className="px-4 py-2.5">현재 단계</th><th className="px-4 py-2.5">현재 상태</th><th className="px-4 py-2.5">필요한 행동</th></tr></thead><tbody className="divide-y divide-slate-100">{queue.slice(0, 8).map((item) => <tr key={item.id} onClick={() => onOpenCase(item.caseId)} className="cursor-pointer hover:bg-blue-50/50"><td className="px-4 py-3 font-semibold text-slate-800">{item.patient}</td><td className="px-4 py-3 text-slate-600">{item.stage}</td><td className="px-4 py-3 text-slate-500">{item.status}</td><td className="px-4 py-3 font-semibold text-blue-700">{item.action}</td></tr>)}{queue.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">현재 검토 대기 업무가 없습니다.</td></tr>}</tbody></table></div></section>
  </>;
}
