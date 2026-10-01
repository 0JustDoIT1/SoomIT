"use client";

import { useEffect, useRef, useState } from "react";
import { showToast } from "@/components/ui/toast/toast";
import type { AuthorizedFetch, PhysicianTreatmentOpinion, TreatmentOpinionResponse } from "./treatment-prescription-types";

type Props = {
  caseId: string;
  apiBaseUrl: string;
  authorizedFetch: AuthorizedFetch;
  readOnly?: boolean;
  selectedRegimenId?: string | null;
  treatmentType?: string;
  treatmentPlan?: string;
};

const DEMO_TREATMENT_OPINION: TreatmentOpinionResponse = {
  status: "CONFIRMED_DATA_FALLBACK_V3",
  opinion: JSON.stringify({
    xray_summary: "흉부 X-ray에서 좌측 폐결절 의심부위가 확인되었다. 이에 따라 흉부 CT 추가 검사를 권고하였다.",
    ct_summary: "후속 흉부 CT에서 1번 결절(최대 28.79 mm), 악성 위험도 93.11%가 확인되었다.",
    staging_summary: "병기 평가를 위해 시행한 PET-CT/TNM 검토 결과 T1c N0 M0, Stage IA3로 확정되었다.",
    pathology_biomarker_summary: "조직검사에서 악성 폐선암이 확인되었다. 유전자 검사에서 EGFR exon 19 결실 및 TP53 변이 소견이 확인되었다. 그 외 검사된 주요 유전자 6개에서는 양성 변이가 확인되지 않았다. PD-L1 TPS는 0.00%로 확정되었다.",
    treatment_summary: "이상의 Stage IA3, 폐선암, EGFR exon 19 결실, TP53 변이 결과를 근거로 오시머티닙(R1) 표적치료를 선택하였다. EGFR 변이를 근거로 Osimertinib 기반 표적치료를 계획하였다.",
    safety_follow_up: "현재 상태는 '처방 안전성 검토 전'이다. 기록된 처방 차단 또는 미해결 경고는 없다. 치료 시작 전 의료진의 최종 안전성 확인과 치료계획에 따른 추적 관찰이 필요하다.",
  }),
  sources: [],
  safety_status: "safety_not_run",
  review_required: true,
};

export function TreatmentOpinionPanel({ caseId, apiBaseUrl, authorizedFetch, readOnly = false, selectedRegimenId, treatmentType = "", treatmentPlan = "" }: Props) {
  const [aiOpinion, setAiOpinion] = useState<TreatmentOpinionResponse | null>(null);
  const [loadedAiCaseId, setLoadedAiCaseId] = useState<string | null>(null);
  const [physicianOpinion, setPhysicianOpinion] = useState("");
  const [loadedPhysicianCaseId, setLoadedPhysicianCaseId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [physicianError, setPhysicianError] = useState("");
  const generatingRef = useRef(false);
  const savingRef = useRef(false);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelDemoRef = useRef<(() => void) | null>(null);
  const demoGenerationEpochRef = useRef(0);
  const mountedRef = useRef(true);
  const loadingPhysicianOpinion = loadedPhysicianCaseId !== caseId;
  const loadingAiOpinion = loadedAiCaseId !== caseId;
  const currentAiOpinion = loadingAiOpinion ? null : aiOpinion;
  const currentPhysicianOpinion = loadingPhysicianOpinion ? "" : physicianOpinion;
  const canGenerate = Boolean(selectedRegimenId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      demoGenerationEpochRef.current += 1;
      if (demoTimerRef.current !== null) clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
      cancelDemoRef.current?.();
      cancelDemoRef.current = null;
    };
  }, [caseId]);

  useEffect(() => {
    let active = true;
    void authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/physician-treatment-opinion/`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as Partial<PhysicianTreatmentOpinion> & { detail?: string };
        if (!response.ok) throw new Error(body.detail || "호흡기내과 소견을 불러오지 못했습니다.");
        if (active) {
          setPhysicianOpinion(body.physician_opinion ?? "");
          setPhysicianError("");
        }
      })
      .catch((caught) => {
        console.error(caught);
        if (active) setPhysicianError("호흡기내과 소견을 불러오지 못했습니다.");
      })
      .finally(() => { if (active) setLoadedPhysicianCaseId(caseId); });
    return () => { active = false; };
  }, [apiBaseUrl, authorizedFetch, caseId]);

  useEffect(() => {
    let active = true;
    void authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-opinion/`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as TreatmentOpinionResponse & { detail?: string };
        if (!response.ok) throw new Error(body.detail || "AI 종합 소견을 불러오지 못했습니다.");
        if (active) {
          setAiOpinion(body.status === "NOT_GENERATED" || !isLongitudinalOpinion(body.opinion) ? null : body);
          setAiError("");
        }
      })
      .catch((caught) => {
        console.error(caught);
        if (active) setAiError("AI 종합 소견을 불러오지 못했습니다.");
      })
      .finally(() => { if (active) setLoadedAiCaseId(caseId); });
    return () => { active = false; };
  }, [apiBaseUrl, authorizedFetch, caseId]);

  const generate = async () => {
    if (!selectedRegimenId || generatingRef.current || loadingAiOpinion) return;
    const demoGenerationEpoch = demoGenerationEpochRef.current;
    const toastId = `case-treatment-ai-${caseId}`;
    generatingRef.current = true;
    setGenerating(true);
    setAiError("");
    showToast.info("진료 종합 소견 생성을 시작했습니다.", { id: toastId });
    try {
      let body: TreatmentOpinionResponse & { detail?: string };
      if (process.env.NEXT_PUBLIC_TREATMENT_OPINION_DEMO === "true") {
        const demoResult = await new Promise<TreatmentOpinionResponse | null>((resolve) => {
          cancelDemoRef.current = () => resolve(null);
          demoTimerRef.current = setTimeout(() => resolve(DEMO_TREATMENT_OPINION), 5_000);
        });
        demoTimerRef.current = null;
        cancelDemoRef.current = null;
        if (!demoResult || !mountedRef.current || demoGenerationEpoch !== demoGenerationEpochRef.current) return;
        body = demoResult;
      } else {
        const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-opinion/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selected_regimen: selectedRegimenId,
            treatment_type: treatmentType,
            treatment_plan: treatmentPlan,
          }),
        });
        body = await response.json().catch(() => ({})) as TreatmentOpinionResponse & { detail?: string };
        if (!response.ok) throw new Error(body.detail || body.status || "Treatment opinion request failed.");
      }
      if (!isLongitudinalOpinion(body.opinion)) throw new Error("단계별 종합 소견 형식이 아닙니다. 백엔드 적용 상태를 확인해주세요.");
      setAiOpinion(body);
      setLoadedAiCaseId(caseId);
      showToast.success("진료 종합 소견 생성이 완료되었습니다.", { id: toastId });
    } catch (caught) {
      console.error(caught);
      const detail = caught instanceof Error ? caught.message : "진료 종합 소견을 생성하지 못했습니다.";
      setAiError(detail);
      showToast.error(detail, { id: toastId });
    } finally {
      generatingRef.current = false;
      if (mountedRef.current && demoGenerationEpoch === demoGenerationEpochRef.current) setGenerating(false);
    }
  };

  const savePhysicianOpinion = async () => {
    if (readOnly || savingRef.current || loadingPhysicianOpinion) return;
    const toastId = `case-physician-treatment-opinion-${caseId}`;
    savingRef.current = true;
    setSaving(true);
    setPhysicianError("");
    showToast.info("호흡기내과 소견을 저장하고 있습니다.", { id: toastId });
    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/physician-treatment-opinion/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ physician_opinion: currentPhysicianOpinion }),
      });
      const body = await response.json().catch(() => ({})) as Partial<PhysicianTreatmentOpinion> & { detail?: string };
      if (!response.ok) throw new Error(body.detail || "호흡기내과 소견 저장에 실패했습니다.");
      setPhysicianOpinion(body.physician_opinion ?? currentPhysicianOpinion);
      showToast.success("호흡기내과 소견이 저장되었습니다.", { id: toastId });
    } catch (caught) {
      console.error(caught);
      const detail = caught instanceof Error ? caught.message : "호흡기내과 소견 저장에 실패했습니다.";
      setPhysicianError(detail);
      showToast.error(detail, { id: toastId });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return <section className="grid min-w-0 gap-3 lg:grid-cols-2" aria-label="진료 종합 소견 비교">
    <article className="flex min-h-[220px] min-w-0 flex-col overflow-hidden rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold text-violet-600">{currentAiOpinion?.status.startsWith("CONFIRMED_DATA_FALLBACK") ? "확정 결과 자동 요약 · 참고용" : "MEDGEMMA · 참고용"}</p><h3 className="text-sm font-bold text-slate-900">{currentAiOpinion?.status.startsWith("CONFIRMED_DATA_FALLBACK") ? "확정 결과 기반 종합 소견" : "AI 진료 종합 소견"}</h3></div>{(!readOnly || (!loadingAiOpinion && !currentAiOpinion)) && <button type="button" onClick={() => void generate()} disabled={generating || loadingAiOpinion || !canGenerate} className="shrink-0 rounded border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{generating ? "종합 소견 생성 중..." : readOnly ? "확정 결과로 종합 소견 생성" : currentAiOpinion ? "종합 소견 다시 생성" : "종합 소견 생성"}</button>}</div>
      {aiError && <p role="alert" className="mt-3 text-xs text-rose-600">{aiError}</p>}
      {!readOnly && !canGenerate && <p className="mt-2 text-xs text-amber-700">Regimen을 선택하면 확정된 검사 결과와 치료계획을 함께 종합할 수 있습니다.</p>}
      <p className="mt-2 text-[11px] leading-5 text-slate-500">확정된 X-ray → CT → PET-CT/TNM → 병리·유전자 → PD-L1 → 치료 결과를 시간순으로 종합합니다.</p>
      <div className="mt-3 max-h-80 min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md bg-white p-3 text-sm leading-6 text-slate-700" aria-label="AI 진료 종합 소견 내용">{loadingAiOpinion ? <p className="text-xs text-slate-500">저장된 AI 종합 소견을 불러오는 중입니다.</p> : currentAiOpinion ? <><OpinionContent opinion={currentAiOpinion.opinion} /><p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">상태 {currentAiOpinion.status} · Safety {currentAiOpinion.safety_status || "-"} · 저장된 참고 소견 · 의료진 검토 필요</p></> : <p className="text-xs text-slate-500">생성된 AI 종합 소견이 없습니다. AI 소견은 참고자료이며 의료진 최종 소견과 별도로 관리됩니다.</p>}</div>
    </article>

    <article className="flex min-h-[220px] flex-col rounded-lg border border-blue-200 bg-blue-50/30 p-3">
      <div><p className="text-[10px] font-semibold text-blue-600">PHYSICIAN NOTE</p><h3 className="text-sm font-bold text-slate-900">호흡기내과 최종 종합 소견</h3></div>
      <label className="mt-3 flex min-h-0 flex-1 flex-col text-xs font-semibold text-slate-700"><span className="sr-only">호흡기내과 최종 종합 소견</span><textarea value={currentPhysicianOpinion} onChange={(event) => setPhysicianOpinion(event.target.value)} disabled={readOnly || loadingPhysicianOpinion || saving} placeholder={loadingPhysicianOpinion ? "소견을 불러오는 중입니다." : "검사 전 과정과 진단·병기·치료계획을 종합한 최종 소견을 입력하세요."} rows={7} className="min-h-[132px] flex-1 resize-none rounded-md border border-slate-300 bg-white p-3 text-sm font-normal leading-6 text-slate-800 disabled:bg-slate-100" /></label>
      {!loadingPhysicianOpinion && !physicianError && !currentPhysicianOpinion && <p className="mt-2 text-xs text-slate-500">작성된 호흡기내과 소견이 없습니다.</p>}
      {physicianError && <p role="alert" className="mt-2 text-xs text-rose-600">{physicianError}</p>}
      {!readOnly && <button type="button" onClick={() => void savePhysicianOpinion()} disabled={loadingPhysicianOpinion || saving} className="mt-3 self-end rounded-md border border-blue-200 bg-white px-4 py-2 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">{saving ? "저장 중..." : "의료진 소견 저장"}</button>}
    </article>
  </section>;
}

const CURRENT_OPINION_LABELS: Record<string, string> = {
  xray_summary: "X-ray 소견",
  ct_summary: "CT 소견",
  staging_summary: "PET-CT / TNM 병기",
  pathology_biomarker_summary: "병리·유전자·PD-L1",
  treatment_summary: "치료계획 및 결정 근거",
  safety_follow_up: "안전성 및 추적 계획",
};

function OpinionContent({ opinion }: { opinion?: string | null }) {
  if (!opinion) return <p>소견 없음</p>;
  const parsed = parseStructuredOpinion(opinion);
  if (parsed) return <dl className="space-y-3">{parsed.map(({ key, label, value }) => <div key={key} className="min-w-0"><dt className="text-xs font-bold text-violet-700">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>;
  return <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{opinion}</p>;
}

function parseStructuredOpinion(opinion: string) {
  const normalized = opinion.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    const entries = Object.entries(CURRENT_OPINION_LABELS).filter(([key]) => typeof parsed[key] === "string" && String(parsed[key]).trim());
    return entries.length ? entries.map(([key, label]) => ({ key, label, value: String(parsed[key]) })) : null;
  } catch {
    return null;
  }
}

function isLongitudinalOpinion(opinion?: string | null) {
  if (!opinion) return false;
  const normalized = opinion.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    return Object.keys(CURRENT_OPINION_LABELS).every((key) => typeof parsed[key] === "string");
  } catch {
    return false;
  }
}
