import type { Candidate, InputSnapshot } from "./preview-types";

type Finding = InputSnapshot["findings"][number];
type CandidateGroup = {
  candidate: Candidate;
  ruleCodes: string[];
  reasons: string[];
  drivers: NonNullable<Candidate["matched_drivers"]>;
};

const ACTIONABLE_CODES: Record<string, string[]> = {
  EGFR: ["EGFR_EX19_DEL", "EGFR_L858R"],
  BRAF: ["BRAF_V600E"],
  MET: ["MET_EXON14_SKIPPING"],
};

const resultLabels: Record<string, string> = {
  EGFR_EX19_DEL: "EX19 deletion",
  EGFR_L858R: "L858R",
  BRAF_V600E: "V600E",
  MET_EXON14_SKIPPING: "Exon 14 skipping",
  LIKELY_NEGATIVE: "Negative",
  INDETERMINATE: "Indeterminate",
};

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function groupCandidates(candidates: Candidate[], treatmentType: string): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const candidate of candidates.filter((item) => item.treatment_type === treatmentType)) {
    const key = candidate.regimen_detail.id;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        candidate,
        ruleCodes: [candidate.rule_code],
        reasons: candidate.match_reasons,
        drivers: candidate.matched_drivers ?? [],
      });
      continue;
    }
    current.ruleCodes = unique([...current.ruleCodes, candidate.rule_code]);
    current.reasons = unique([...current.reasons, ...candidate.match_reasons]);
    const driverKeys = new Set(current.drivers.map((driver) =>
      `${driver.gene_symbol}:${driver.alteration_codes.join(",")}`,
    ));
    for (const driver of candidate.matched_drivers ?? []) {
      const driverKey = `${driver.gene_symbol}:${driver.alteration_codes.join(",")}`;
      if (!driverKeys.has(driverKey)) {
        current.drivers.push(driver);
        driverKeys.add(driverKey);
      }
    }
  }
  return [...groups.values()];
}

function isActionable(finding: Finding) {
  return finding.assessment === "LIKELY_POSITIVE"
    && Boolean(finding.alteration_code)
    && (ACTIONABLE_CODES[finding.gene_symbol] ?? []).includes(finding.alteration_code ?? "");
}

export function PreviewRegimenCandidates({
  candidates,
  treatmentType,
  selected,
  findings,
  onSelect,
}: {
  candidates: Candidate[];
  treatmentType: string;
  selected: string;
  findings: Finding[];
  onSelect: (candidate: Candidate) => void;
}) {
  const visible = groupCandidates(candidates, treatmentType);
  const actionable = findings.filter(isActionable);
  const multipleDrivers = actionable.length > 1;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold">03 · Regimen 선택</h2>
      {multipleDrivers && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">복수의 actionable driver가 확인되었습니다.</p>
          <p className="mt-1">
            자동 치료 우선순위는 적용하지 않습니다. 각 분자 결과와 치료 근거를 검토한 뒤 최종 Regimen을 선택해주세요.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead>
                <tr className="border-b border-amber-200">
                  <th className="py-1 pr-3">Driver</th>
                  <th className="py-1 pr-3">결과</th>
                  <th className="py-1">관련 후보</th>
                </tr>
              </thead>
              <tbody>
                {findings.filter((finding) => finding.gene_symbol in ACTIONABLE_CODES).map((finding) => {
                  const related = unique(candidates.filter((candidate) =>
                    candidate.matched_drivers?.some((driver) => driver.gene_symbol === finding.gene_symbol),
                  ).map((candidate) => candidate.regimen_detail.regimen_code));
                  return (
                    <tr key={finding.gene_symbol} className="border-b border-amber-100 last:border-0">
                      <td className="py-1 pr-3 font-semibold">{finding.gene_symbol}</td>
                      <td className="py-1 pr-3">{resultLabels[finding.alteration_code ?? finding.assessment] ?? finding.assessment}</td>
                      <td className="py-1">{related.join(", ") || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {visible.map(({ candidate, ruleCodes, reasons, drivers }) => (
          <button
            type="button"
            key={candidate.regimen_detail.id}
            onClick={() => onSelect(candidate)}
            className={`rounded-xl border p-4 text-left ${selected === candidate.regimen_detail.id ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-300"}`}
          >
            <div className="flex justify-between gap-3">
              <b>{candidate.regimen_detail.regimen_code}</b>
              <span className="text-xs">priority {candidate.priority}</span>
            </div>
            <p className="mt-1 font-semibold">{candidate.regimen_detail.regimen_name}</p>
            <p className="mt-2 text-xs text-slate-600">치료방법: {candidate.therapy_label}</p>
            <p className="mt-1 text-xs text-slate-600">Rule: {ruleCodes.join(", ")}</p>
            <p className="mt-1 text-xs text-slate-600">
              Driver: {drivers.length ? drivers.map((driver) => `${driver.gene_symbol} ${driver.alteration_codes.join(", ")}`).join(" · ") : "해당 없음"}
            </p>
            <p className="mt-1 text-xs text-slate-500">매칭: {reasons.join(" · ")}</p>
            <p className="mt-1 text-[11px] text-slate-400">{candidate.evidence_source ?? "근거 출처 없음"}</p>
          </button>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">선택한 치료방법에 해당하는 후보가 없습니다.</p>
      )}
    </section>
  );
}
