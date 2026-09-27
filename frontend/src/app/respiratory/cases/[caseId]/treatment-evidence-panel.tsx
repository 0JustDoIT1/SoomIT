"use client";

import { useState } from "react";

import type { AuthorizedFetch, RegimenCandidate, TreatmentDecision, TreatmentEvidenceResponse } from "./treatment-prescription-types";

type Props = {
  caseId: string;
  apiBaseUrl: string;
  authorizedFetch: AuthorizedFetch;
  candidates: RegimenCandidate[];
  selectedRegimen: TreatmentDecision["selected_regimen_detail"];
};

export function TreatmentEvidencePanel({ caseId, apiBaseUrl, authorizedFetch, candidates, selectedRegimen }: Props) {
  const [data, setData] = useState<TreatmentEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ruleCodes = unique(candidates.map((candidate) => candidate.rule_code));
  const matchReasons = unique(candidates.flatMap((candidate) => candidate.match_reasons));
  const recommendedRegimens = unique(candidates.map((candidate) => `${candidate.regimen_detail.regimen_code} ${candidate.regimen_detail.regimen_name}`));

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-evidence/`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || "Treatment evidence request failed.");
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Treatment evidence request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="treatment-evidence-title">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Decision support</p>
        <h3 id="treatment-evidence-title" className="mt-1 text-base font-bold text-slate-900">치료 결정 근거</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">치료계획을 뒷받침하는 참고 정보이며 필수 진행 단계가 아닙니다.</p>
      </div>

      {(ruleCodes.length > 0 || matchReasons.length > 0 || recommendedRegimens.length > 0 || selectedRegimen) && (
        <dl className="mt-4 space-y-3 border-y border-slate-100 py-3 text-xs">
          {ruleCodes.length > 0 && <EvidenceRow label="적용 Rule" value={ruleCodes.join(", ")} />}
          {matchReasons.length > 0 && <EvidenceRow label="핵심 근거" value={matchReasons.join(" · ")} />}
          {recommendedRegimens.length > 0 && <EvidenceRow label="추천 Regimen" value={recommendedRegimens.join(", ")} />}
          {selectedRegimen && <EvidenceRow label="최종 선택" value={`${selectedRegimen.regimen_code} ${selectedRegimen.regimen_name}`} emphasis />}
        </dl>
      )}

      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {loading ? "조회 중" : data ? "상세 근거 새로고침" : "상세 근거 보기"}
      </button>

      {error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}
      {data && (
        <details open className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-700">NCI PDQ Evidence 상세</summary>
          <div className="mt-3 space-y-2 text-slate-600">
            <p>상태: {data.status}</p>
            {data.treatment_rule && <p>Rule: {data.treatment_rule.rule_code} · {data.treatment_rule.evidence_source ?? "-"}</p>}
            {data.evidence?.answer && <p className="whitespace-pre-wrap rounded bg-white p-3">{data.evidence.answer}</p>}
            {data.evidence?.sources?.map((source) => <div key={`${source.document}-${source.chunk_index}`} className="rounded border border-slate-200 bg-white p-2">{source.document} · chunk {source.chunk_index} · distance {source.distance}<br />{source.excerpt}</div>)}
          </div>
        </details>
      )}
    </section>
  );
}

function EvidenceRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="grid grid-cols-[88px_1fr] gap-2"><dt className="text-slate-500">{label}</dt><dd className={emphasis ? "font-bold text-blue-700" : "font-semibold text-slate-800"}>{value}</dd></div>;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
