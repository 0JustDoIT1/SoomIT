"use client";

import { useEffect, useMemo, useState } from "react";
import type { GeneFinding, InputSnapshot, PreviewData } from "./preview-types";

const missing = "미입력 · 확인 필요";
const ACTIONABLE_GENES = ["EGFR", "BRAF", "MET"] as const;
const alterationOptions: Record<string, string[]> = {
  EGFR: ["EGFR_EX19_DEL", "EGFR_L858R"],
  BRAF: ["BRAF_V600E"],
  MET: ["MET_EXON14_SKIPPING"],
};
const geneStatusLabels: Record<string, string> = {
  LIKELY_POSITIVE: "양성",
  LIKELY_NEGATIVE: "음성",
  INDETERMINATE: "판정불가",
};
const alterationLabels: Record<string, string> = {
  EGFR_EX19_DEL: "EGFR Exon 19 결실",
  EGFR_L858R: "EGFR L858R 변이",
  BRAF_V600E: "BRAF V600E 변이",
  MET_EXON14_SKIPPING: "MET Exon 14 skipping",
};

type SnapshotFinding = InputSnapshot["findings"][number];

const valueOf = (value: unknown, suffix = "") =>
  value == null || value === "" ? missing : `${String(value)}${suffix}`;

const pdl1Category = (value: unknown) => {
  const tps = Number(value);
  if (!Number.isFinite(tps)) return "";
  if (tps < 1) return "LT_1";
  if (tps < 50) return "FROM_1_TO_49";
  return "GE_50";
};

function normalizeFinding(finding: GeneFinding): SnapshotFinding | null {
  const geneSymbol = finding.gene_symbol?.trim().toUpperCase();
  const assessment = finding.assessment?.trim();
  if (!geneSymbol || !assessment) return null;
  return {
    gene_symbol: geneSymbol,
    assessment,
    alteration_code: assessment === "LIKELY_POSITIVE" ? finding.alteration_code || null : null,
  };
}

function initialFindings(
  confirmedFindings: GeneFinding[],
  snapshotFindings: GeneFinding[],
) {
  const byGene = new Map<string, SnapshotFinding>();
  for (const finding of confirmedFindings) {
    const normalized = normalizeFinding(finding);
    if (normalized && !byGene.has(normalized.gene_symbol)) {
      byGene.set(normalized.gene_symbol, normalized);
    }
  }
  // A saved snapshot is the user's latest Preview input. Overlay it by gene while
  // retaining confirmed genes that older single-gene snapshots did not contain.
  for (const finding of snapshotFindings) {
    const normalized = normalizeFinding(finding);
    if (normalized) byGene.set(normalized.gene_symbol, normalized);
  }
  return {
    actionable: ACTIONABLE_GENES.map((gene) => byGene.get(gene) ?? {
      gene_symbol: gene,
      assessment: "",
      alteration_code: null,
    }),
    other: [...byGene.values()].filter(
      (finding) => !ACTIONABLE_GENES.includes(finding.gene_symbol as typeof ACTIONABLE_GENES[number]),
    ),
  };
}

export function PreviewClinicalSummary({
  data,
  onSnapshotChange,
}: {
  data: PreviewData;
  onSnapshotChange?: (snapshot: InputSnapshot) => void;
}) {
  const confirmed = useMemo(
    () => data.clinical.filter((item) => item.result_status === "CONFIRMED"),
    [data.clinical],
  );
  const confirmedFindings = useMemo(
    () => confirmed.flatMap((item) =>
      item.workflow_stage === "PATHOLOGY_GENE" ? (item.result_detail?.gene?.findings ?? []) : [],
    ),
    [confirmed],
  );
  const pathology = confirmed.find((item) => item.workflow_stage === "PATHOLOGY_GENE")?.result_detail?.pathology;
  const tnm = confirmed.find((item) => item.workflow_stage === "PET_CT_TNM")?.result_detail?.tnm;
  const pdl1 = confirmed.find((item) => item.workflow_stage === "PDL1")?.result_detail?.pdl1;
  const lab = data.labs[0] ?? {};
  const profile = data.case ?? {};
  const allergy = data.allergy ?? {};
  const savedSnapshot = data.decision?.input_snapshot;
  const initial = useMemo(
    () => initialFindings(confirmedFindings, savedSnapshot?.findings ?? []),
    [confirmedFindings, savedSnapshot?.findings],
  );

  const [cancerType, setCancerType] = useState(savedSnapshot?.cancer_type ?? data.candidates[0]?.cancer_type ?? "");
  const [histology, setHistology] = useState(savedSnapshot?.histology ?? pathology?.histologic_type ?? "");
  const [findings, setFindings] = useState<SnapshotFinding[]>(initial.actionable);
  const [otherFindings] = useState<SnapshotFinding[]>(initial.other);
  const [pdl1Value, setPdl1Value] = useState(savedSnapshot?.pdl1_category ?? pdl1Category(pdl1?.tps_percent));
  const [history, setHistory] = useState("");

  const incompletePositive = findings.find(
    (finding) => finding.assessment === "LIKELY_POSITIVE" && !finding.alteration_code,
  );
  const snapshot = useMemo<InputSnapshot>(() => ({
    cancer_type: cancerType,
    histology,
    findings: [
      ...findings.filter((finding) => finding.assessment),
      ...otherFindings,
    ],
    pdl1_category: pdl1Value as InputSnapshot["pdl1_category"],
  }), [cancerType, findings, histology, otherFindings, pdl1Value]);

  useEffect(() => {
    if (
      onSnapshotChange
      && snapshot.cancer_type
      && snapshot.histology
      && snapshot.findings.length
      && snapshot.pdl1_category
      && !incompletePositive
    ) {
      onSnapshotChange(snapshot);
    }
  }, [incompletePositive, onSnapshotChange, snapshot]);

  const updateFinding = (geneSymbol: string, update: Partial<SnapshotFinding>) => {
    setFindings((current) => current.map((finding) =>
      finding.gene_symbol === geneSymbol ? { ...finding, ...update } : finding,
    ));
  };

  const select = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: string[],
    labels: Record<string, string> = {},
  ) => (
    <label className="text-xs font-semibold text-slate-700">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm font-normal"
      >
        <option value="">선택</option>
        {options.map((option) => <option key={option} value={option}>{labels[option] ?? option}</option>)}
      </select>
    </label>
  );

  const renderGroup = (title: string, items: [string, string][]) => (
    <div className="mt-3">
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3 text-xs">
            <p className="text-slate-500">{label}</p>
            <p className="mt-1 font-semibold text-slate-800">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const doseNeeded = data.prescriptions.some((prescription) =>
    prescription.items.some((item) => item.dose_basis === "MG_PER_M2" || item.dose_basis === "AUC"),
  );
  const doseItems: [string, string][] = [
    ["Height", valueOf(profile.height_cm, " cm")],
    ["Weight", valueOf(profile.weight_kg, " kg")],
    ["eGFR", valueOf(lab.egfr, " mL/min/1.73m²")],
  ];
  const safetyItems: [string, string][] = [
    ["Allergy", allergy.allergy_status === "NONE" ? "알레르기 없음" : valueOf(allergy.allergy_status)],
    ["Current medications", data.medications.filter((item) => item.is_active !== false).length ? `${data.medications.length}개` : "복용 중인 약물 없음"],
    ["AST", valueOf(lab.ast)],
    ["ALT", valueOf(lab.alt)],
    ["Total bilirubin", valueOf(lab.total_bilirubin)],
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold">01 · 확정 임상정보 입력</h2>
      <p className="mt-1 text-xs text-slate-500">
        의사가 최종 확인한 검사 결과를 기준으로 입력합니다. AI 예측값은 치료 Rule 입력으로 사용하지 않습니다.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {select("암종", cancerType, setCancerType, ["NSCLC", "SCLC"], { NSCLC: "비소세포폐암 (NSCLC)", SCLC: "소세포폐암 (SCLC)" })}
        {select("조직형", histology, setHistology, ["LUAD", "LUSC"], { LUAD: "폐선암 (LUAD)", LUSC: "폐편평상피암 (LUSC)" })}
      </div>
      <div className="mt-3 space-y-3" aria-label="유전자 결과 입력">
        {findings.map((finding) => {
          const gene = finding.gene_symbol;
          return (
            <fieldset key={gene} className="rounded border border-slate-200 bg-slate-50/50 p-3">
              <legend className="px-1 text-xs font-bold text-slate-800">{gene}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {select(
                  `${gene} 임상 상태`,
                  finding.assessment,
                  (assessment) => updateFinding(gene, {
                    assessment,
                    alteration_code: assessment === "LIKELY_POSITIVE" ? finding.alteration_code : null,
                  }),
                  ["LIKELY_POSITIVE", "LIKELY_NEGATIVE", "INDETERMINATE"],
                  geneStatusLabels,
                )}
                {finding.assessment === "LIKELY_POSITIVE" && select(
                  `${gene} 세부 변이`,
                  finding.alteration_code ?? "",
                  (alterationCode) => {
                    if (alterationCode === "OTHER_UNKNOWN") {
                      updateFinding(gene, { assessment: "INDETERMINATE", alteration_code: null });
                    } else {
                      updateFinding(gene, { alteration_code: alterationCode || null });
                    }
                  },
                  [...(alterationOptions[gene] ?? []), "OTHER_UNKNOWN"],
                  { ...alterationLabels, OTHER_UNKNOWN: "기타/확정 불가 → 판정불가" },
                )}
              </div>
            </fieldset>
          );
        })}
      </div>
      {incompletePositive && (
        <p role="alert" className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {incompletePositive.gene_symbol} 양성 결과는 구체적인 변이 유형을 확인해야 합니다.
        </p>
      )}
      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs">
        <p className="font-semibold">확정 분자검사 결과</p>
        {confirmedFindings.length ? confirmedFindings.map((item, index) => (
          <div key={`${item.gene_symbol}-${index}`} className="mt-2 rounded bg-white p-2">
            <b>{item.gene_symbol}</b> · {geneStatusLabels[item.assessment ?? ""] ?? item.assessment} · {(alterationLabels[item.alteration_code ?? ""] ?? item.alteration_code) || missing}
          </div>
        )) : <p className="mt-2">신규 입력값을 선택하세요.</p>}
      </div>
      <div className="mt-3 rounded-lg border p-3">
        {select("PD-L1 결과", pdl1Value, setPdl1Value, ["LT_1", "FROM_1_TO_49", "GE_50"], { LT_1: "1% 미만", FROM_1_TO_49: "1~49%", GE_50: "50% 이상 · 고발현" })}
        <p className="mt-2 text-xs text-slate-500">실제 후보 판정은 backend Treatment Rule이 수행합니다.</p>
      </div>
      <div className="mt-3 rounded-lg border p-3">
        <label className="text-xs font-semibold">
          병력 및 치료 이력
          <textarea value={history} onChange={(event) => setHistory(event.target.value)} rows={4} placeholder="주요 병력, 이전 치료 내용 등 치료 결정에 필요한 사항을 입력하세요." className="mt-2 block w-full rounded border p-2 text-sm font-normal" />
        </label>
        <p className="mt-2 text-[11px] text-slate-500">현재 Preview local state로만 유지되며 저장되지 않습니다.</p>
      </div>
      {doseNeeded && renderGroup("05 · 용량 계산을 위한 환자정보", doseItems)}
      {data.prescriptions.length > 0 && renderGroup("08 · 처방 안전성 정보", safetyItems)}
      {tnm?.stage_group && <p className="mt-3 text-xs text-slate-500">Stage {tnm.stage_group}은 확정 결과로 보존되며, 실제 후보 판정은 backend Treatment Rule이 수행합니다.</p>}
    </section>
  );
}
