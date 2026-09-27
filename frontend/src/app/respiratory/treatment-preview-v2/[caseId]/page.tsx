"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRespiratoryAuth } from "../../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../../_lib/respiratory-api";
import { loadPreview, postJson, previewCandidates } from "./preview-api";
import type { Candidate, InputSnapshot, PreviewData } from "./preview-types";
import { PreviewClinicalSummary } from "./preview-clinical-summary";
import { PreviewTreatmentSelector } from "./preview-treatment-selector";
import { PreviewRegimenCandidates } from "./preview-regimen-candidates";
import { PreviewTreatmentDecision } from "./preview-treatment-decision";
import { PreviewPrescription } from "./preview-prescription";
import { PreviewSafetyPanel } from "./preview-safety-panel";
import { PreviewEvidencePanel } from "./preview-evidence-panel";
import { PreviewOpinionPanel } from "./preview-opinion-panel";

export default function TreatmentPreviewV2Page() {
  const params = useParams<{ caseId: string }>();
  const caseId = typeof params.caseId === "string" ? params.caseId : "";
  const { authorizedFetch } = useRespiratoryAuth();
  const [data, setData] = useState<PreviewData | null>(null);
  const [method, setMethod] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<InputSnapshot | null>(null);

  const refresh = useCallback(async () => {
    if (!caseId) return;
    try {
      setError("");
      const next = await loadPreview(authorizedFetch, API_BASE_URL, caseId);
      setData(next);
      setCandidate((current) => current ?? next.candidates.find((item) => item.regimen_detail.id === next.decision?.selected_regimen) ?? null);
      setMethod((current) => current || next.decision?.treatment_type || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Preview 데이터를 불러오지 못했습니다.");
    }
  }, [authorizedFetch, caseId]);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    void loadPreview(authorizedFetch, API_BASE_URL, caseId).then((next) => {
      if (cancelled) return;
      setError("");
      setData(next);
      setCandidate((current) => current ?? next.candidates.find((item) => item.regimen_detail.id === next.decision?.selected_regimen) ?? null);
      setMethod((current) => current || next.decision?.treatment_type || "");
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Preview 데이터를 불러오지 못했습니다.");
    });
    return () => { cancelled = true; };
  }, [authorizedFetch, caseId]);

  const visibleCandidate = candidate;
  const confirmed = data?.decision?.decision_status === "CONFIRMED";
  const selectedRegimen = visibleCandidate?.regimen_detail.id ?? data?.decision?.selected_regimen ?? null;

  const handleSnapshotChange = useCallback((next: InputSnapshot) => {
    setSnapshot(next);
    void previewCandidates(authorizedFetch, API_BASE_URL, caseId, next)
      .then((candidates) => {
        setData((current) => current ? { ...current, candidates } : current);
        setCandidate((current) => current && candidates.some(
          (item) => item.regimen_detail.id === current.regimen_detail.id,
        ) ? current : null);
      })
      .catch(() => undefined);
  }, [authorizedFetch, caseId]);

  const saveDecision = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try { await postJson(authorizedFetch, API_BASE_URL, `/api/doctor/cases/${caseId}/treatment-decision/`, body); await refresh(); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "치료결정 저장에 실패했습니다."); }
    finally { setBusy(false); }
  };

  const confirmDecision = async () => {
    setBusy(true); setError("");
    try { await postJson(authorizedFetch, API_BASE_URL, `/api/doctor/cases/${caseId}/treatment-decision/confirm/`, {}); await refresh(); }
    catch (confirmError) { setError(confirmError instanceof Error ? confirmError.message : "치료결정 확정에 실패했습니다."); }
    finally { setBusy(false); }
  };

  if (!caseId) return <main className="p-6 text-sm text-slate-500">유효한 Case ID가 필요합니다.</main>;
  if (!data) return <main className="h-full min-h-0 overflow-y-auto p-6">{error || "Preview를 불러오는 중..."}</main>;
  return <main className="h-full min-h-0 overflow-y-auto overflow-x-hidden"><div className="mx-auto max-w-6xl space-y-5 p-6">
    <header className="rounded-xl border border-blue-100 bg-blue-50 p-5"><p className="text-xs font-semibold text-blue-700">PREVIEW V2 · INTEGRATION TEST</p><h1 className="mt-1 text-xl font-bold text-slate-900">치료 방법부터 MedGemma까지</h1><p className="mt-2 break-all font-mono text-xs text-slate-500">caseId: {caseId}</p></header>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <PreviewClinicalSummary data={data} onSnapshotChange={handleSnapshotChange} />
    <PreviewTreatmentSelector candidates={data.candidates} value={method} onChange={(value) => { setMethod(value); setCandidate(null); }} />
    <PreviewRegimenCandidates candidates={data.candidates} treatmentType={method} selected={selectedRegimen ?? ""} findings={snapshot?.findings ?? []} onSelect={setCandidate} />
    <PreviewTreatmentDecision candidate={visibleCandidate} decision={data.decision} confirmed={Boolean(confirmed)} busy={busy} inputSnapshot={snapshot} onSave={saveDecision} onConfirm={() => void confirmDecision()} />
    <PreviewPrescription caseId={caseId} base={API_BASE_URL} fetcher={authorizedFetch} prescriptions={data.prescriptions} selectedRegimen={selectedRegimen} onRefresh={() => void refresh()} />
    <PreviewSafetyPanel caseId={caseId} base={API_BASE_URL} fetcher={authorizedFetch} prescription={data.prescriptions[0]} onRefresh={() => void refresh()} />
    <PreviewEvidencePanel caseId={caseId} base={API_BASE_URL} fetcher={authorizedFetch} selectedRegimen={selectedRegimen} />
    <PreviewOpinionPanel caseId={caseId} base={API_BASE_URL} fetcher={authorizedFetch} selectedRegimen={selectedRegimen} treatmentType={method || data.decision?.treatment_type || ""} treatmentPlan={data.decision?.treatment_plan || ""} />
  </div></main>;
}
