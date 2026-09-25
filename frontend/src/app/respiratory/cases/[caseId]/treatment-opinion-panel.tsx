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

export function TreatmentOpinionPanel({ caseId, apiBaseUrl, authorizedFetch, readOnly = false, selectedRegimenId, treatmentType = "", treatmentPlan = "" }: Props) {
  const [aiOpinion, setAiOpinion] = useState<TreatmentOpinionResponse | null>(null);
  const [physicianOpinion, setPhysicianOpinion] = useState("");
  const [loadedPhysicianCaseId, setLoadedPhysicianCaseId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [physicianError, setPhysicianError] = useState("");
  const generatingRef = useRef(false);
  const savingRef = useRef(false);
  const loadingPhysicianOpinion = loadedPhysicianCaseId !== caseId;
  const currentPhysicianOpinion = loadingPhysicianOpinion ? "" : physicianOpinion;
  const canGenerate = Boolean(selectedRegimenId);

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

  const generate = async () => {
    if (readOnly || !selectedRegimenId || generatingRef.current) return;
    const toastId = `case-treatment-ai-${caseId}`;
    generatingRef.current = true;
    setGenerating(true);
    setAiError("");
    showToast.info("치료 소견 생성을 시작했습니다.", { id: toastId });
    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-opinion/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_regimen: selectedRegimenId,
          treatment_type: treatmentType,
          treatment_plan: treatmentPlan,
        }),
      });
      const body = await response.json().catch(() => ({})) as TreatmentOpinionResponse & { detail?: string };
      if (!response.ok) throw new Error(body.detail || body.status || "Treatment opinion request failed.");
      setAiOpinion(body);
      showToast.success("치료 소견 생성이 완료되었습니다.", { id: toastId });
    } catch (caught) {
      console.error(caught);
      setAiError("치료 소견을 생성하지 못했습니다.");
      showToast.error("치료 소견 생성에 실패했습니다.", { id: toastId });
    } finally {
      generatingRef.current = false;
      setGenerating(false);
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

  return <section className="grid gap-3 lg:grid-cols-2" aria-label="치료 소견 비교">
    <article className="flex min-h-[220px] flex-col rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold text-violet-600">MEDGEMMA · 참고용</p><h3 className="text-sm font-bold text-slate-900">AI 치료 소견</h3></div>{!readOnly && <button type="button" onClick={() => void generate()} disabled={generating || !canGenerate} className="shrink-0 rounded border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{generating ? "치료 소견 생성 중..." : aiOpinion ? "치료 소견 다시 생성" : "치료 소견 생성"}</button>}</div>
      {aiError && <p role="alert" className="mt-3 text-xs text-rose-600">{aiError}</p>}
      {!readOnly && !canGenerate && <p className="mt-2 text-xs text-amber-700">Regimen을 선택하면 현재 치료계획을 기준으로 치료 소견을 생성할 수 있습니다.</p>}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-md bg-white p-3 text-sm leading-6 text-slate-700" aria-label="AI 치료 소견 내용">{aiOpinion ? <><p className="whitespace-pre-wrap">{aiOpinion.opinion ?? "소견 없음"}</p><p className="mt-3 text-[11px] text-slate-400">상태 {aiOpinion.status} · Safety {aiOpinion.safety_status ?? "-"} · 의료진 검토 필요</p></> : <p className="text-xs text-slate-500">생성된 AI 치료 소견이 없습니다. AI 소견은 참고자료이며 의료진 소견과 별도로 관리됩니다.</p>}</div>
    </article>

    <article className="flex min-h-[220px] flex-col rounded-lg border border-blue-200 bg-blue-50/30 p-3">
      <div><p className="text-[10px] font-semibold text-blue-600">PHYSICIAN NOTE</p><h3 className="text-sm font-bold text-slate-900">호흡기내과 소견</h3></div>
      <label className="mt-3 flex min-h-0 flex-1 flex-col text-xs font-semibold text-slate-700"><span className="sr-only">호흡기내과 소견</span><textarea value={currentPhysicianOpinion} onChange={(event) => setPhysicianOpinion(event.target.value)} disabled={readOnly || loadingPhysicianOpinion || saving} placeholder={loadingPhysicianOpinion ? "소견을 불러오는 중입니다." : "치료에 대한 의료진 소견을 입력하세요."} rows={7} className="min-h-[132px] flex-1 resize-none rounded-md border border-slate-300 bg-white p-3 text-sm font-normal leading-6 text-slate-800 disabled:bg-slate-100" /></label>
      {!loadingPhysicianOpinion && !physicianError && !currentPhysicianOpinion && <p className="mt-2 text-xs text-slate-500">작성된 호흡기내과 소견이 없습니다.</p>}
      {physicianError && <p role="alert" className="mt-2 text-xs text-rose-600">{physicianError}</p>}
      {!readOnly && <button type="button" onClick={() => void savePhysicianOpinion()} disabled={loadingPhysicianOpinion || saving} className="mt-3 self-end rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{saving ? "저장 중..." : "의료진 소견 저장"}</button>}
    </article>
  </section>;
}
