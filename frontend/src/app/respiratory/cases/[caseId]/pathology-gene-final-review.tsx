"use client";

import { useMemo, useState } from "react";

type GeneFinding = {
  gene_symbol: string;
  assessment: string;
  alteration_code?: string | null;
};

type ClinicalResult = {
  id?: string;
  result_status?: string;
  result_detail?: {
    gene?: {
      findings?: GeneFinding[];
    };
  };
};

type Props = {
  caseId: string;
  apiBaseUrl: string;
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  clinicalResult?: ClinicalResult;
  onConfirmed?: () => void;
};

const ALTERATIONS: Record<string, { value: string; label: string }[]> = {
  EGFR: [
    { value: "EGFR_EX19_DEL", label: "Exon 19 deletion" },
    { value: "EGFR_L858R", label: "L858R" },
  ],
  BRAF: [{ value: "BRAF_V600E", label: "V600E" }],
  MET: [{ value: "MET_EXON14_SKIPPING", label: "Exon 14 skipping" }],
};

const ACTIONABLE_GENES = Object.keys(ALTERATIONS);

function errorMessage(body: unknown) {
  if (!body || typeof body !== "object") return "유전자 결과 확정에 실패했습니다.";
  const value = body as Record<string, unknown>;
  if (typeof value.detail === "string") return value.detail;
  const findings = value.gene_findings;
  if (Array.isArray(findings)) {
    const text = findings.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (!item || typeof item !== "object") return [];
      return Object.values(item as Record<string, unknown>).flatMap((message) =>
        Array.isArray(message) ? message.map(String) : [String(message)],
      );
    }).filter(Boolean);
    if (text.length) return text.join(" ");
  }
  return "유전자 결과 확정에 실패했습니다.";
}

export function PathologyGeneFinalReview({
  caseId,
  apiBaseUrl,
  authorizedFetch,
  clinicalResult,
  onConfirmed,
}: Props) {
  const sourceFindings = clinicalResult?.result_detail?.gene?.findings;
  const [findings, setFindings] = useState<GeneFinding[]>(sourceFindings ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const actionable = useMemo(
    () => findings.filter((finding) => ACTIONABLE_GENES.includes(finding.gene_symbol.toUpperCase())),
    [findings],
  );
  const incomplete = actionable.find(
    (finding) => finding.assessment === "LIKELY_POSITIVE" && !finding.alteration_code,
  );

  if (clinicalResult?.result_status !== "DRAFT" || !clinicalResult.id || actionable.length === 0) {
    return null;
  }

  const updateFinding = (geneSymbol: string, update: Partial<GeneFinding>) => {
    setFindings((current) => current.map((finding) =>
      finding.gene_symbol.toUpperCase() === geneSymbol
        ? { ...finding, ...update }
        : finding,
    ));
    setError("");
  };

  const confirm = async () => {
    if (incomplete || busy) {
      if (incomplete) {
        setError(`${incomplete.gene_symbol.toUpperCase()} 양성 결과는 구체적인 변이 유형을 확인해야 합니다.`);
      }
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await authorizedFetch(
        `${apiBaseUrl}/api/doctor/cases/${caseId}/clinical-results/pathology/${clinicalResult.id}/confirm/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gene_findings: findings.map((finding) => ({
              gene_symbol: finding.gene_symbol,
              assessment: finding.assessment,
              alteration_code: finding.alteration_code || null,
            })),
          }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(body));
      onConfirmed?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "유전자 결과 확정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="호흡기내과 유전자 최종 검토" className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <header>
        <p className="text-xs font-semibold text-blue-700">호흡기내과 최종 검토</p>
        <p className="mt-1 text-xs text-slate-600">치료 결정에 사용할 임상 유전자 상태와 세부 변이를 확인해주세요.</p>
      </header>
      <div className="mt-3 space-y-3">
        {actionable.map((finding) => {
          const gene = finding.gene_symbol.toUpperCase();
          return (
            <fieldset key={gene} className="rounded border border-slate-200 bg-white p-2">
              <legend className="px-1 text-xs font-bold text-slate-800">{gene}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">
                  임상 상태
                  <select
                    aria-label={`${gene} 임상 상태`}
                    value={finding.assessment}
                    disabled={busy}
                    onChange={(event) => updateFinding(gene, {
                      assessment: event.target.value,
                      alteration_code: event.target.value === "LIKELY_POSITIVE" ? finding.alteration_code ?? null : null,
                    })}
                    className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs"
                  >
                    <option value="LIKELY_POSITIVE">POSITIVE</option>
                    <option value="LIKELY_NEGATIVE">NEGATIVE</option>
                    <option value="INDETERMINATE">INDETERMINATE</option>
                  </select>
                </label>
                {finding.assessment === "LIKELY_POSITIVE" && (
                  <label className="text-xs font-medium text-slate-600">
                    세부 변이
                    <select
                      aria-label={`${gene} 세부 변이`}
                      value={finding.alteration_code ?? ""}
                      disabled={busy}
                      onChange={(event) => {
                        if (event.target.value === "OTHER_UNKNOWN") {
                          updateFinding(gene, { assessment: "INDETERMINATE", alteration_code: null });
                        } else {
                          updateFinding(gene, { alteration_code: event.target.value || null });
                        }
                      }}
                      className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs"
                    >
                      <option value="">선택해주세요</option>
                      {ALTERATIONS[gene].map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                      <option value="OTHER_UNKNOWN">기타/확정 불가 → INDETERMINATE</option>
                    </select>
                  </label>
                )}
              </div>
            </fieldset>
          );
        })}
      </div>
      {incomplete && (
        <p role="alert" className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {incomplete.gene_symbol.toUpperCase()} 양성 결과는 구체적인 변이 유형을 확인해야 합니다.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <button
        type="button"
        disabled={Boolean(incomplete) || busy}
        onClick={() => void confirm()}
        className="mt-3 w-full rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {busy ? "확정 중..." : "검토 결과 확정"}
      </button>
    </section>
  );
}
