"use client";

import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { EvidenceViewerPanel } from "./evidence-viewer-panel";

export type TnmCategory = "T" | "N" | "M";
type AiTnm = { predicted_t?: string | null; predicted_n?: string | null; predicted_m?: string | null; predicted_stage_group?: string | null; confidence?: string | number | null };
type ClinicalTnm = { t_category?: string | null; n_category?: string | null; m_category?: string | null; stage_group?: string | null; evidence?: unknown; note?: string | null };
type TnmDraft = { selectedValue: string; decisionType: string; opinion: string; rationale: string; unresolvedIssue: string; dirty: boolean };

const META: Record<TnmCategory, string> = { T: "T 원발 종양", N: "N 림프절", M: "M 원격 전이" };
const EMPTY_DRAFT: TnmDraft = { selectedValue: "", decisionType: "", opinion: "", rationale: "", unresolvedIssue: "", dirty: false };

export function TnmReviewWorkspace({ aiTnm, clinicalTnm, modelName, modelVersion, onDirtyChange }: { aiTnm?: AiTnm; clinicalTnm?: ClinicalTnm; modelName?: string; modelVersion?: string; onDirtyChange?: (dirty: boolean) => void }) {
  const [category, setCategory] = useState<TnmCategory>("T");
  const [drafts, setDrafts] = useState<Record<TnmCategory, TnmDraft>>({ T: { ...EMPTY_DRAFT }, N: { ...EMPTY_DRAFT }, M: { ...EMPTY_DRAFT } });
  const tabRefs = useRef<Record<TnmCategory, HTMLButtonElement | null>>({ T: null, N: null, M: null });
  const saveReasonId = useId();
  const draft = drafts[category];
  const dirty = Object.values(drafts).some((item) => item.dirty);
  const aiValue = valueFor(category, aiTnm);
  const clinicalValue = confirmedFor(category, clinicalTnm);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const updateDraft = (patch: Partial<TnmDraft>) => setDrafts((current) => ({ ...current, [category]: { ...current[category], ...patch, dirty: true } }));
  const selectCategory = (next: TnmCategory) => { setCategory(next); requestAnimationFrame(() => tabRefs.current[next]?.focus()); };
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const items: TnmCategory[] = ["T", "N", "M"];
    const offset = event.key === "ArrowRight" ? 1 : -1;
    selectCategory(items[(items.indexOf(category) + offset + items.length) % items.length]);
  };

  return (
    <section className="h-full min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="grid h-full min-w-[980px] grid-rows-[40px_minmax(0,1fr)]">
        <header className="flex items-center justify-between border-b border-slate-200 px-3"><div className="flex items-center gap-2"><h1 className="whitespace-nowrap text-sm font-bold text-slate-900">TNM 후보 검토 및 의료진 확정</h1><span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700">TNM 개별 소견 저장 API 연동 대기</span></div><p className="truncate text-[10px] text-slate-500">AI 후보 · 전문과 확정 근거 · 호흡기내과 결정을 구분해 검토합니다.</p></header>
        <div className="grid min-h-0 grid-cols-[minmax(660px,1fr)_320px]">
          <main className="grid min-h-0 grid-rows-[38px_minmax(170px,1fr)_30px_142px] border-r border-slate-200">
            <nav role="tablist" aria-label="TNM 범주" className="grid grid-cols-4 border-b border-slate-200">
              {(["T", "N", "M"] as TnmCategory[]).map((item) => <button ref={(node) => { tabRefs.current[item] = node; }} key={item} id={`tnm-tab-${item}`} role="tab" aria-selected={category === item} aria-controls={`tnm-panel-${item}`} tabIndex={category === item ? 0 : -1} type="button" onClick={() => selectCategory(item)} onKeyDown={handleTabKeyDown} className={`whitespace-nowrap border-r border-slate-200 px-2 text-[11px] font-bold ${category === item ? "bg-blue-50 text-blue-700 shadow-[inset_0_-2px_0_#2563eb]" : "text-slate-500"}`}>{META[item]} <span className="font-normal">{confirmedFor(item, clinicalTnm) ? "· 결과 있음" : "· 미확인"}</span>{drafts[item].dirty && <span className="ml-1 text-amber-600" aria-label="저장되지 않은 변경사항">●</span>}</button>)}
              <button type="button" disabled aria-describedby={saveReasonId} className="whitespace-nowrap text-[11px] font-bold text-slate-400">TNM 종합 · 잠김</button>
            </nav>
            <section id={`tnm-panel-${category}`} role="tabpanel" aria-labelledby={`tnm-tab-${category}`} className="min-h-0 p-2">
              <div className="grid h-full grid-cols-3 gap-2">
                <ReviewCard title="A. AI·규칙 후보" source="AI 분석 후보"><Field label={`${category} 후보`} value={aiValue} /><Field label="Confidence" value={aiTnm?.confidence} /><Field label="모델명·버전" value={[modelName, modelVersion].filter(Boolean).join(" · ")} /><button type="button" disabled aria-describedby={saveReasonId} className="mt-auto rounded border border-slate-200 py-1 text-[9px] text-slate-400">모델 근거 API 연동 대기</button></ReviewCard>
                <ReviewCard title="B. 전문과 확정 근거" source="의료진 확정"><Field label="확정 결과" value={clinicalValue} /><Field label="핵심 소견" value={clinicalTnm?.note} clamp /><Field label="근거 자료" value={clinicalTnm?.evidence ? "연결됨" : undefined} /><button type="button" disabled aria-describedby={saveReasonId} className="mt-auto rounded border border-slate-200 py-1 text-[9px] text-slate-400">전체 판독문 API 연동 대기</button></ReviewCard>
                <ReviewCard title="C. 호흡기내과 결정" source="최종 진료 판단"><label className="text-[9px] text-slate-500" htmlFor={`tnm-value-${category}`}>최종 {category} 선택</label><input id={`tnm-value-${category}`} value={draft.selectedValue} onChange={(event) => updateDraft({ selectedValue: event.target.value })} placeholder={`${category} 병기 선택`} className="mt-0.5 h-7 w-full rounded border border-slate-200 px-2 text-[11px]" /><label className="mt-1 text-[9px] text-slate-500" htmlFor={`tnm-opinion-${category}`}>{category} 의사 소견</label><textarea id={`tnm-opinion-${category}`} value={draft.opinion} onChange={(event) => updateDraft({ opinion: event.target.value })} rows={2} placeholder="의사 소견 입력" className="mt-0.5 w-full resize-none rounded border border-slate-200 p-1.5 text-[11px]" /><div className="mt-auto grid grid-cols-4 gap-1">{["채택", "수정", "재검", "보류"].map((label) => <button key={label} type="button" aria-pressed={draft.decisionType === label} onClick={() => updateDraft({ decisionType: label })} className={`rounded py-1 text-[9px] font-semibold ${draft.decisionType === label ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{label}</button>)}</div></ReviewCard>
              </div>
            </section>
            <ResultDifference aiValue={aiValue} clinicalValue={clinicalValue} />
            <EvidenceViewerPanel />
          </main>
          <ReviewSidebar category={category} onSelect={selectCategory} aiTnm={aiTnm} clinicalTnm={clinicalTnm} reasonId={saveReasonId} />
        </div>
      </div>
      <p id={saveReasonId} className="sr-only">TNM 개별 소견과 확정 저장 API가 연결된 후 사용할 수 있습니다.</p>
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

function ResultDifference({ aiValue, clinicalValue }: { aiValue: unknown; clinicalValue: unknown }) {
  const comparison = compareTnmValues(aiValue, clinicalValue);
  const labels: Record<TnmComparison, string> = { MATCH: "결과 일치", DIFFERENCE: "결과 차이 확인 필요", UNAVAILABLE: "비교 불가", EMPTY: "비교할 결과 없음" };
  return <div className={`mx-2 flex min-w-0 items-center gap-3 rounded border px-3 text-[10px] ${comparison === "DIFFERENCE" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}><strong className="whitespace-nowrap">{labels[comparison]}</strong><span className="truncate">AI 후보 {format(aiValue)} · 전문과 판단 {format(clinicalValue)}</span><button type="button" disabled={comparison !== "DIFFERENCE"} className="ml-auto whitespace-nowrap rounded border border-current px-2 py-0.5 font-semibold disabled:border-slate-200 disabled:text-slate-300">근거 비교</button></div>;
}

function ReviewSidebar({ category, onSelect, aiTnm, clinicalTnm, reasonId }: { category: TnmCategory; onSelect: (value: TnmCategory) => void; aiTnm?: AiTnm; clinicalTnm?: ClinicalTnm; reasonId: string }) {
  return <aside className="min-h-0 overflow-y-auto bg-slate-50/50 p-2"><section className="rounded-lg border border-slate-200 bg-white p-2.5"><h2 className="text-[11px] font-bold text-slate-900">T / N / M 검토 현황</h2><div className="mt-1.5 space-y-1">{(["T", "N", "M"] as TnmCategory[]).map((item) => <button key={item} type="button" onClick={() => onSelect(item)} className={`flex min-h-11 w-full items-center justify-between rounded border px-2.5 text-left ${category === item ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}><span className="whitespace-nowrap text-[11px] font-semibold">{META[item]}</span><span className="text-right text-[9px] leading-4 text-slate-500">AI 후보 {format(valueFor(item, aiTnm))}<br />의사 선택 {format(confirmedFor(item, clinicalTnm))}</span></button>)}</div></section><section className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5"><h2 className="text-[11px] font-bold text-slate-900">TNM 종합 확정 조건</h2><ul className="mt-1.5 space-y-0.5">{(["T", "N", "M"] as TnmCategory[]).map((item) => <li key={item} className="flex items-center gap-2 text-[10px] text-slate-600"><span className="text-slate-300">○</span>{item} 개별 확정</li>)}<li className="text-[10px] text-slate-500">○ 결과 충돌 해결</li><li className="text-[10px] text-slate-500">○ 필수 근거 확인</li><li className="text-[10px] text-slate-500">○ TNM 종합 소견 작성</li></ul><button type="button" disabled aria-describedby={reasonId} className="mt-2 h-7 w-full rounded bg-slate-200 text-[10px] font-semibold text-slate-400">cTNM 및 Stage Group 확정</button><p className="mt-1.5 text-[9px] leading-4 text-slate-500">T·N·M 개별 확정과 종합 소견이 완료되면 활성화됩니다.</p></section><section className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5"><div className="flex items-center justify-between gap-2"><h2 className="text-[11px] font-bold text-slate-900">TNM 종합 소견</h2><span className="text-[9px] text-slate-400">전문과 판독 근거</span></div><div className="mt-1.5 grid grid-cols-4 gap-1"><Summary label="cT" value={clinicalTnm?.t_category} /><Summary label="cN" value={clinicalTnm?.n_category} /><Summary label="cM" value={clinicalTnm?.m_category} /><Summary label="Stage Group" value={clinicalTnm?.stage_group} /></div></section></aside>;
}

function ReviewCard({ title, source, children }: { title: string; source: string; children: React.ReactNode }) { return <article className="flex min-h-0 flex-col rounded-lg border border-slate-200 p-2.5"><div className="flex items-center justify-between gap-2"><h2 className="whitespace-nowrap text-[11px] font-bold text-slate-800">{title}</h2><span className="whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] text-slate-500">{source}</span></div><div className="mt-2 flex min-h-0 flex-1 flex-col space-y-1.5">{children}</div></article>; }
function Field({ label, value, clamp = false }: { label: string; value: unknown; clamp?: boolean }) { return <div className="flex gap-2 text-[10px]"><span className="shrink-0 text-slate-400">{label}</span><span className={`ml-auto text-right font-semibold text-slate-700 ${clamp ? "line-clamp-2" : "truncate"}`}>{format(value)}</span></div>; }
function Summary({ label, value }: { label: string; value?: string | null }) { return <div className="rounded bg-slate-50 p-1.5 text-center"><p className="text-[9px] text-slate-400">{label}</p><p className="truncate text-[10px] font-bold text-slate-700">{value || "-"}</p></div>; }
function valueFor(category: TnmCategory, data?: AiTnm) { return category === "T" ? data?.predicted_t : category === "N" ? data?.predicted_n : data?.predicted_m; }
function confirmedFor(category: TnmCategory, data?: ClinicalTnm) { return category === "T" ? data?.t_category : category === "N" ? data?.n_category : data?.m_category; }
function format(value: unknown) { return value === null || value === undefined || value === "" ? "-" : String(value); }
