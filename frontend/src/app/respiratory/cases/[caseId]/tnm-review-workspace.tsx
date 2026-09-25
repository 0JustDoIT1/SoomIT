"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { DecisionActions, DecisionStatus } from "./decision-ui";
import { CaseDicomEvidence } from "./case-dicom-evidence";
import { CaseWorkflowDecision, type WorkflowDecisionCompletion } from "./case-workflow-decision";
import { showToast } from "@/components/ui/toast/toast";

export type TnmCategory = "T" | "N" | "M";
type AiTnm = { ai_result_id?: string; predicted_t?: string | null; predicted_n?: string | null; predicted_m?: string | null; predicted_stage_group?: string | null; confidence?: string | number | null; result_payload?: { t?: Record<string, unknown>; n?: Record<string, unknown>; m?: Record<string, unknown> } };
type ClinicalTnm = { t_category?: string | null; n_category?: string | null; m_category?: string | null; stage_group?: string | null; evidence?: { stage?: { ctnm_candidate?: string | null; stage_group_candidate?: string | null; stage_group_status?: string | null; warnings?: string[] } } | null; note?: string | null };
type TnmDraft = { selectedValue: string; decisionType: string; opinion: string; rationale: string; unresolvedIssue: string; dirty: boolean };
const OPTIONS: Record<TnmCategory, string[]> = { T: ["TX","T0","Tis","T1mi","T1a","T1b","T1c","T1","T2a","T2b","T2","T3","T4"], N: ["NX","N0","N1","N2","N2a","N2b","N3"], M: ["M0","M1","M1a","M1b","M1c","M1c1","M1c2","M_indeterminate"] };

const META: Record<TnmCategory, string> = { T: "T 원발 종양", N: "N 림프절", M: "M 원격 전이" };
const EMPTY_DRAFT: TnmDraft = { selectedValue: "", decisionType: "", opinion: "", rationale: "", unresolvedIssue: "", dirty: false };

export function TnmReviewWorkspace({ actionable = true, aiTnm, clinicalTnm, clinicalResultId, clinicalResultStatus, modelName, modelVersion, caseId, apiBaseUrl, authorizedFetch, onConfirmed, onStageAdvanced, onDirtyChange }: { actionable?: boolean; aiTnm?: AiTnm; clinicalTnm?: ClinicalTnm; clinicalResultId?: string; clinicalResultStatus?: string; modelName?: string; modelVersion?: string; caseId?: string; apiBaseUrl?: string; authorizedFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; onConfirmed?: () => void | Promise<void>; onStageAdvanced?: (completion: WorkflowDecisionCompletion) => void | Promise<void>; onDirtyChange?: (dirty: boolean) => void }) {
  const [category, setCategory] = useState<TnmCategory>("T");
  const [edits, setEdits] = useState<Partial<Record<TnmCategory, TnmDraft>>>({});
  const [savedDrafts, setSavedDrafts] = useState<Record<TnmCategory, TnmDraft> | null>(null);
  const baseline = savedDrafts ?? {
    T: { ...EMPTY_DRAFT, selectedValue: clinicalTnm?.t_category ?? "", opinion: clinicalTnm?.note ?? "" },
    N: { ...EMPTY_DRAFT, selectedValue: clinicalTnm?.n_category ?? "" },
    M: { ...EMPTY_DRAFT, selectedValue: clinicalTnm?.m_category ?? "" },
  };
  const drafts = { T: edits.T ?? baseline.T, N: edits.N ?? baseline.N, M: edits.M ?? baseline.M };
  const tabRefs = useRef<Record<TnmCategory, HTMLButtonElement | null>>({ T: null, N: null, M: null });
  const draft = drafts[category];
  const dirty = Object.values(drafts).some((item) => item.dirty);
  const aiValue = valueFor(category, aiTnm);
  const clinicalValue = confirmedFor(category, clinicalTnm);
  const resultComparison = compareTnmValues(aiValue, clinicalValue);
  const showResultComparison = resultComparison !== "DIFFERENCE";

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const updateDraft = (patch: Partial<TnmDraft>, target: TnmCategory = category) => {
    if (!actionable || submittingRef.current || resultConfirmed) return;
    const updated = { ...drafts[target], ...patch, dirty: false };
    const original = { ...baseline[target], dirty: false };
    setEdits((current) => ({ ...current, [target]: { ...updated, dirty: JSON.stringify(updated) !== JSON.stringify(original) } }));
  };
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [stageResult, setStageResult] = useState<ClinicalTnm | null>(null);
  const activeResultId = savedId ?? clinicalResultId ?? null;
  const resultConfirmed = isConfirmed || clinicalResultStatus === "CONFIRMED";
  const post = async (path: string, body?: object) => {
    if (!authorizedFetch || !apiBaseUrl || !caseId) throw new Error("TNM 결과를 처리할 수 없습니다.");
    const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/clinical-results/tnm/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "TNM 결과 처리에 실패했습니다.");
    return data as ClinicalTnm & { id?: string };
  };
  const saveDraft = async () => {
    if (!aiTnm?.ai_result_id || !draftComplete) throw new Error("AI 결과와 T·N·M 선택값이 필요합니다.");
    const data = await post("", { reviewed_ai_result_id: aiTnm.ai_result_id, t_category: drafts.T.selectedValue, n_category: drafts.N.selectedValue, m_category: drafts.M.selectedValue, note: drafts.T.opinion });
    if (!data.id) throw new Error("저장된 TNM 결과 ID를 확인할 수 없습니다.");
    setSavedId(data.id);
    setSavedDrafts({ T: { ...drafts.T, dirty: false }, N: { ...drafts.N, dirty: false }, M: { ...drafts.M, dirty: false } });
    setEdits({});
    setMessage("TNM 초안이 저장되었습니다.");
    return data.id;
  };
  const selectCategory = (next: TnmCategory) => { setCategory(next); requestAnimationFrame(() => tabRefs.current[next]?.focus()); };
  const draftComplete = Object.values(drafts).every((item) => item.selectedValue);
  const stage = (stageResult ?? clinicalTnm)?.evidence?.stage;
  const candidateReady = stage?.stage_group_status === "candidate_ready" && Boolean(stage.stage_group_candidate);
  const stageConfirmed = resultConfirmed && Boolean((stageResult ?? clinicalTnm)?.stage_group?.trim());
  const canFinalize = !stageConfirmed && draftComplete && Boolean(activeResultId || aiTnm?.ai_result_id);
  const completeTnm = async () => {
    let latestId = activeResultId;
    if (dirty || !latestId) latestId = await saveDraft();
    if (!resultConfirmed) {
      await post(`${latestId}/confirm/`);
      setIsConfirmed(true);
      await onConfirmed?.();
    }
    const calculatedStage = await post(`${latestId}/stage/`);
    const calculatedCandidate = calculatedStage.evidence?.stage;
    setStageResult(calculatedStage);
    if (calculatedCandidate?.stage_group_status !== "candidate_ready" || !calculatedCandidate.stage_group_candidate) {
      throw new Error("TNM Stage Group 후보를 계산할 수 없습니다.");
    }
    const confirmedStage = await post(`${latestId}/stage/confirm/`, { advance_to_next_stage: false });
    setStageResult(confirmedStage);
    setMessage("TNM 병기가 확정되었습니다. 다음 처리 방식을 선택하세요.");
    await onConfirmed?.();
  };
  const runNextAction = async () => {
    if (!actionable || submittingRef.current || !canFinalize || !authorizedFetch || !apiBaseUrl || !caseId) return;
    const toastId = `case-tnm-${caseId}`;
    submittingRef.current = true;
    setBusy(true); setError(""); setMessage("");
    showToast.info("TNM 결과를 처리하고 있습니다.", { id: toastId });
    try {
      await completeTnm();
      showToast.success("TNM 병기가 확정되었습니다. 다음 처리 방식을 선택하세요.", { id: toastId });
    } catch (cause) {
      console.error(cause);
      setError("TNM 결과 처리에 실패했습니다.");
      showToast.error("TNM 결과 처리에 실패했습니다.", { id: toastId });
    }
    finally { submittingRef.current = false; setBusy(false); }
  };
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const items: TnmCategory[] = ["T", "N", "M"];
    const offset = event.key === "ArrowRight" ? 1 : -1;
    selectCategory(items[(items.indexOf(category) + offset + items.length) % items.length]);
  };
  const statusLabel = stageConfirmed
    ? "Stage Group 확정 완료"
    : resultConfirmed
      ? "결과 확정 · Stage 계산 필요"
      : actionable
        ? "검토 중"
        : "조회 전용";
  const showStatusFooter = dirty || Boolean(error) || Boolean(message) || !actionable;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white" aria-label="TNM 작업공간">
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[44px_minmax(0,1fr)]">
        <header aria-label="PET-CT/TNM 상단 작업" className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="whitespace-nowrap text-sm font-bold text-slate-900">PET-CT 기반 TNM 병기 검토</h1>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-700">{statusLabel}</span>
              </div>
              <p className="truncate text-[9px] text-slate-500">T/N/M 분석 → Stage Group 계산 → 호흡기내과 최종 확정</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dirty && <span className="hidden text-[9px] font-semibold text-amber-700 xl:inline">저장되지 않은 변경사항</span>}
            {stageConfirmed ? (
              actionable && caseId && authorizedFetch && activeResultId ? (
                <CaseWorkflowDecision
                  caseId={caseId}
                  currentStage="PET_CT_TNM"
                  confirmedResultId={activeResultId}
                  confirmedStageGroup={(stageResult ?? clinicalTnm)?.stage_group}
                  showCaseCloseOption
                  triggerLabel="다음 처리 선택"
                  authorizedFetch={authorizedFetch}
                  onCompleted={(completion) => { void onStageAdvanced?.(completion); }}
                />
              ) : null
            ) : actionable ? (
              <div className="[&>div]:mt-0">
                <DecisionActions busy={busy} disabled={!canFinalize || !authorizedFetch || !apiBaseUrl || !caseId} label="TNM 확정 및 다음 단계 진행" onSubmit={() => void runNextAction()} />
              </div>
            ) : null}
          </div>
        </header>
        <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]">
          <div className={`grid min-h-0 min-w-0 border-r border-slate-200 ${showResultComparison ? "grid-rows-[30px_minmax(0,1fr)_28px]" : "grid-rows-[30px_minmax(0,1fr)]"}`}>
            <nav role="tablist" aria-label="TNM 범주" className="grid grid-cols-3 border-b border-slate-200">
              {(["T", "N", "M"] as TnmCategory[]).map((item) => <button ref={(node) => { tabRefs.current[item] = node; }} key={item} id={`tnm-tab-${item}`} role="tab" aria-selected={category === item} aria-controls={`tnm-panel-${item}`} tabIndex={category === item ? 0 : -1} type="button" onClick={() => selectCategory(item)} onKeyDown={handleTabKeyDown} className={`whitespace-nowrap border-r border-slate-200 px-2 text-[11px] font-bold ${category === item ? "bg-blue-50 text-blue-700 shadow-[inset_0_-2px_0_#2563eb]" : "text-slate-500"}`}>{META[item]} <span className="font-normal">{confirmedFor(item, clinicalTnm) ? "· 결과 있음" : "· 미확인"}</span>{drafts[item].dirty && <span className="ml-1 text-amber-600" aria-label="저장되지 않은 변경사항">●</span>}</button>)}
            </nav>
            {caseId && apiBaseUrl && authorizedFetch ? (
              <CaseDicomEvidence
                caseId={caseId}
                apiBaseUrl={apiBaseUrl}
                authorizedFetch={authorizedFetch}
                stage="PET_CT_TNM"
              />
            ) : null}
            {showResultComparison && <ResultDifference comparison={resultComparison} aiValue={aiValue} clinicalValue={clinicalValue} />}
          </div>
          <section id={`tnm-panel-${category}`} role="tabpanel" aria-labelledby={`tnm-tab-${category}`} className="min-h-0 min-w-0 overflow-y-auto p-2 [scrollbar-gutter:stable]">
              <div className="grid grid-cols-2 gap-2 [&>article:last-child]:col-span-2">
                <ReviewCard title="A. AI·규칙 후보" source="AI 분석 후보"><Field label={`${category} 후보`} value={aiValue} /><Field label="Confidence" value={aiTnm?.confidence} /><Field label="모델명·버전" value={[modelName, modelVersion].filter(Boolean).join(" · ")} /></ReviewCard>
                <ReviewCard title="B. 호흡기내과 판정 근거" source="의료진 확정"><Field label="확정 결과" value={clinicalValue} /><Field label="핵심 소견" value={clinicalTnm?.note} clamp /><Field label="근거 자료" value={clinicalTnm?.evidence ? "연결됨" : undefined} /></ReviewCard>
                <ReviewCard title="C. 호흡기내과 결정" source="최종 진료 판단"><label className="text-[9px] text-slate-500" htmlFor={`tnm-value-${category}`}>최종 {category} 선택</label><select disabled={!actionable || busy || resultConfirmed} id={`tnm-value-${category}`} value={draft.selectedValue} onChange={(event) => updateDraft({ selectedValue: event.target.value })} className="mt-0.5 h-7 w-full rounded border border-slate-200 px-2 text-[11px]"><option value="">선택</option>{OPTIONS[category].map((option) => <option key={option} value={option}>{option}</option>)}</select><label className="mt-1 text-[9px] text-slate-500" htmlFor={`tnm-opinion-${category}`}>TNM 종합 소견</label><textarea disabled={!actionable || busy || resultConfirmed} id={`tnm-opinion-${category}`} value={drafts.T.opinion} onChange={(event) => updateDraft({ opinion: event.target.value }, "T")} rows={2} placeholder="의사 소견 입력" className="mt-0.5 w-full resize-none rounded border border-slate-200 p-1.5 text-[11px]" /><p className="text-[9px] text-slate-500">T·N·M과 종합 소견은 함께 저장됩니다.</p></ReviewCard>
              </div>
          <ReviewSidebar category={category} onSelect={selectCategory} aiTnm={aiTnm} clinicalTnm={clinicalTnm} />
          </section>
        </div>
      </div>
      <div className="mx-2 shrink-0 rounded border border-violet-100 bg-violet-50 px-3 py-1 text-xs text-slate-700">Stage 후보: {format(stage?.stage_group_candidate)} · cTNM: {format(stage?.ctnm_candidate)} · {stageConfirmed ? "최종 확정 완료" : candidateReady ? "확정 가능" : "Stage 계산 대기"}{(stage?.warnings?.length ?? 0) > 0 && <div role="alert" className="mt-1 max-h-16 overflow-y-auto text-amber-700">{stage?.warnings?.join(" / ")}</div>}</div>
      {showStatusFooter && <div className="shrink-0 border-t border-slate-200 px-3 py-1.5 [&>p]:mt-0">
        {dirty && <p className="text-xs text-amber-700">저장되지 않은 변경사항이 있습니다. 확정 시 최신값을 먼저 저장합니다.</p>}
        <DecisionStatus error={error} message={!actionable ? "현재 Case 단계가 아니므로 결과 조회만 가능합니다." : message} />
      </div>}
    </section>
  );
}

export type TnmComparison = "MATCH" | "DIFFERENCE" | "UNAVAILABLE" | "EMPTY";
export function compareTnmValues(aiValue: unknown, clinicalValue: unknown): TnmComparison {
  const hasAi = aiValue !== null && aiValue !== undefined && aiValue !== "";
  const hasClinical = clinicalValue !== null && clinicalValue !== undefined && clinicalValue !== "";
  if (!hasAi && !hasClinical) return "EMPTY";
  if (!hasAi || !hasClinical) return "UNAVAILABLE";
  return String(aiValue) === String(clinicalValue) ? "MATCH" : "DIFFERENCE";
}

function ResultDifference({ comparison, aiValue, clinicalValue }: { comparison: TnmComparison; aiValue: unknown; clinicalValue: unknown }) {
  if (comparison === "DIFFERENCE") return null;
  const labels: Record<Exclude<TnmComparison, "DIFFERENCE">, string> = { MATCH: "결과 일치", UNAVAILABLE: "비교 불가", EMPTY: "비교할 결과 없음" };
  return <div className="mx-2 flex min-w-0 items-center gap-3 rounded border border-slate-200 bg-slate-50 px-3 text-[10px] text-slate-500"><strong className="whitespace-nowrap">{labels[comparison]}</strong><span className="truncate">AI 후보 {format(aiValue)} · 호흡기내과 판단 {format(clinicalValue)}</span></div>;
}

function ReviewSidebar({ category, onSelect, aiTnm, clinicalTnm }: { category: TnmCategory; onSelect: (value: TnmCategory) => void; aiTnm?: AiTnm; clinicalTnm?: ClinicalTnm }) {
  return <aside className="min-h-0 overflow-y-auto bg-slate-50/50 p-2"><section className="rounded-lg border border-slate-200 bg-white p-2.5"><h2 className="text-[11px] font-bold text-slate-900">T / N / M 검토 현황</h2><div className="mt-1.5 space-y-1">{(["T", "N", "M"] as TnmCategory[]).map((item) => <button key={item} type="button" onClick={() => onSelect(item)} className={`flex min-h-11 w-full items-center justify-between rounded border px-2.5 text-left ${category === item ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}><span className="whitespace-nowrap text-[11px] font-semibold">{META[item]}</span><span className="text-right text-[9px] leading-4 text-slate-500">AI 후보 {format(valueFor(item, aiTnm))}<br />의사 선택 {format(confirmedFor(item, clinicalTnm))}</span></button>)}</div></section><section className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5"><div className="flex items-center justify-between gap-2"><h2 className="text-[11px] font-bold text-slate-900">TNM 종합 소견</h2><span className="text-[9px] text-slate-400">호흡기내과 판정 근거</span></div><div className="mt-1.5 grid grid-cols-4 gap-1"><Summary label="cT" value={clinicalTnm?.t_category} /><Summary label="cN" value={clinicalTnm?.n_category} /><Summary label="cM" value={clinicalTnm?.m_category} /><Summary label="Stage Group" value={clinicalTnm?.stage_group} /></div></section></aside>;
}

function ReviewCard({ title, source, children }: { title: string; source: string; children: React.ReactNode }) { return <article className="flex min-h-0 min-w-0 flex-col rounded-lg border border-slate-200 p-2.5"><div className="flex flex-wrap items-center justify-between gap-1"><h2 className="text-[11px] font-bold text-slate-800">{title}</h2><span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] text-slate-500">{source}</span></div><div className="mt-2 flex min-h-0 flex-1 flex-col space-y-1.5">{children}</div></article>; }
function Field({ label, value }: { label: string; value: unknown; clamp?: boolean }) { return <div className="flex flex-wrap gap-x-2 text-[10px]"><span className="shrink-0 text-slate-400">{label}</span><span className="ml-auto min-w-0 break-words text-right font-semibold text-slate-700 [overflow-wrap:anywhere]">{format(value)}</span></div>; }
function Summary({ label, value }: { label: string; value?: string | null }) { return <div className="rounded bg-slate-50 p-1.5 text-center"><p className="text-[9px] text-slate-400">{label}</p><p className="truncate text-[10px] font-bold text-slate-700">{value || "-"}</p></div>; }
function valueFor(category: TnmCategory, data?: AiTnm) { const payload = data?.result_payload?.[category.toLowerCase() as "t" | "n" | "m"]; if (payload) { if (category === "T") return payload.t_candidate ? String(payload.t_candidate) : payload.size_only_t_candidate ? `크기 기준 후보 ${payload.size_only_t_candidate}` : "판정 후보 없음"; if (category === "N") return `${payload.nplus_probability == null ? "-" : `${(Number(payload.nplus_probability) * 100).toFixed(1)}%`} · ${payload.risk_tier ?? "위험도 미정"}${payload.may_assign_cn === false ? " · cN 직접 할당 불가" : ""}`; return payload.m_candidate === "M_indeterminate" ? "M 판정 보류" : String(payload.m_candidate ?? "판정 후보 없음"); } return category === "T" ? data?.predicted_t : category === "N" ? data?.predicted_n : data?.predicted_m; }
function confirmedFor(category: TnmCategory, data?: ClinicalTnm) { return category === "T" ? data?.t_category : category === "N" ? data?.n_category : data?.m_category; }
function format(value: unknown) { return value === null || value === undefined || value === "" ? "-" : String(value); }
