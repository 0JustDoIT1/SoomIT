"use client";

import { useCallback, useEffect, useState } from "react";

import type { AuthorizedFetch, RegimenCandidate, TreatmentDecision } from "./treatment-prescription-types";
import { TreatmentEvidencePanel } from "./treatment-evidence-panel";
import { TreatmentOpinionPanel } from "./treatment-opinion-panel";

export function TreatmentDecisionPanel({
  caseId,
  apiBaseUrl,
  authorizedFetch,
  onTreatmentChanged,
}: {
  caseId: string;
  apiBaseUrl: string;
  authorizedFetch: AuthorizedFetch;
  onTreatmentChanged?: (decision: TreatmentDecision) => void;
}) {
  const [candidates, setCandidates] = useState<RegimenCandidate[]>([]);
  const [decision, setDecision] = useState<TreatmentDecision | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [candidateResponse, decisionResponse] = await Promise.all([
        authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/regimen-candidates/`),
        authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/`),
      ]);
      if (!candidateResponse.ok) throw new Error("Regimen candidates request failed.");
      const nextCandidates = await candidateResponse.json();
      const nextDecision = decisionResponse.ok ? await decisionResponse.json() : null;
      setCandidates(nextCandidates);
      setDecision(nextDecision);
      setSelected(nextDecision?.selected_regimen ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Treatment decision request failed.");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, authorizedFetch, caseId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const save = async (confirm = false) => {
    setBusy(true);
    setError("");
    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/${confirm ? "confirm/" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: confirm ? undefined : JSON.stringify({ selected_regimen: selected }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Treatment decision request failed.");
      setDecision(payload);
      onTreatmentChanged?.(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Treatment decision request failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <section className="rounded-lg bg-white p-4 text-sm">치료 후보 조회 중...</section>;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-bold">Treatment Decision</h2>
        {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
        {candidates.length === 0 ? <p className="mt-3 text-xs text-slate-500">현재 치료 후보가 없습니다.</p> : <div className="mt-3 space-y-2">
          {candidates.map((candidate) => <button type="button" key={candidate.id} onClick={() => setSelected(candidate.regimen_detail.id)} className={`block w-full rounded border p-3 text-left ${selected === candidate.regimen_detail.id ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
            <p className="text-sm font-semibold">{candidate.regimen_detail.regimen_name} ({candidate.regimen_detail.regimen_code})</p>
            <p className="text-xs">Rule {candidate.rule_code} · priority {candidate.priority}</p>
            <p className="text-xs text-slate-500">{candidate.match_reasons.join(" · ")}</p>
            <p className="text-xs text-slate-500">{candidate.evidence_source ?? "-"}</p>
          </button>)}
        </div>}
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={!selected || busy} onClick={() => void save()} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:bg-slate-300">DRAFT 저장</button>
          <button type="button" disabled={!decision || busy} onClick={() => void save(true)} className="rounded bg-emerald-600 px-3 py-2 text-xs text-white disabled:bg-slate-300">확정</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">현재 선택: {selected || "없음"} · 상태: {decision?.decision_status ?? "-"}</p>
      </section>
      <TreatmentEvidencePanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} />
      <TreatmentOpinionPanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} />
    </div>
  );
}
