type TreatmentSummary = {
  treatment_type_label: string | null;
  selected_regimen_detail: { regimen_name: string } | null;
} | null;

type PrescriptionSummary = {
  id: string;
  prescription_status: string;
  safety_check_results: { result: "PASS" | "WARNING" | "BLOCK" }[];
};

type ClinicalEvidence = { workflow_stage: string; result_status?: string; result_status_label?: string; result_detail?: unknown };
type AiEvidence = { analysis_type: string; status?: string; status_label?: string; result_detail?: unknown };

export function TreatmentPrescriptionOverview({ treatment, prescriptions, clinicalResults = [], aiResults = [] }: { treatment: TreatmentSummary; prescriptions: PrescriptionSummary[]; clinicalResults?: ClinicalEvidence[]; aiResults?: AiEvidence[] }) {
  const warningCount = prescriptions.reduce((count, item) => count + item.safety_check_results.filter((result) => result.result === "WARNING").length, 0);
  const blockCount = prescriptions.reduce((count, item) => count + item.safety_check_results.filter((result) => result.result === "BLOCK").length, 0);
  const finalCount = prescriptions.filter((item) => item.prescription_status === "FINAL").length;
  const evidence = buildTreatmentEvidence(clinicalResults, aiResults);

  return (
    <section className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex h-9 items-center justify-between border-b border-slate-200 px-4">
        <h2 className="text-sm font-bold text-slate-900">치료·처방 현황</h2>
        <p className="text-[11px] text-slate-500">의료진 치료 결정과 실제 처방 상태를 함께 확인합니다.</p>
      </header>
      <div className="grid grid-cols-4 divide-x divide-slate-200 bg-slate-50/50">
        <Summary label="치료 유형" value={treatment?.treatment_type_label} />
        <Summary label="선택 치료요법" value={treatment?.selected_regimen_detail?.regimen_name} />
        <Summary label="처방 상태" value={prescriptions.length > 0 ? `전체 ${prescriptions.length}건 · 최종 ${finalCount}건` : undefined} />
        <Summary label="안전성 확인" value={blockCount > 0 ? `차단 ${blockCount}건` : warningCount > 0 ? `경고 ${warningCount}건` : prescriptions.length > 0 ? "차단·경고 없음" : undefined} tone={blockCount > 0 ? "danger" : warningCount > 0 ? "warning" : "default"} />
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-200">
        {evidence.map((item) => <EvidenceSummary key={item.label} {...item} />)}
      </div>
    </section>
  );
}

function EvidenceSummary({ label, specialist, ai }: { label: string; specialist: string; ai: string }) {
  return <div className="min-w-0 px-4 py-2.5"><p className="text-[10px] font-bold text-slate-700">{label}</p><div className="mt-1.5 flex min-w-0 items-center gap-2 text-[10px]"><span className="shrink-0 font-semibold text-emerald-700">전문과 확정</span><span className="min-w-0 truncate text-slate-500">{specialist}</span></div><div className="mt-1 flex min-w-0 items-center gap-2 text-[10px]"><span className="shrink-0 font-semibold text-blue-700">AI 후보</span><span className="min-w-0 truncate text-slate-500">{ai}</span></div></div>;
}

function buildTreatmentEvidence(clinicalResults: ClinicalEvidence[], aiResults: AiEvidence[]) {
  const confirmed = (type: string) => clinicalResults.find((result) => result.workflow_stage === type && result.result_status === "CONFIRMED");
  const completedAi = (type: string) => aiResults.find((result) => result.analysis_type === type && result.status === "SUCCEEDED");
  const tnmClinical = confirmed("PET_CT_TNM");
  const pathology = confirmed("PATHOLOGY_GENE");
  const gene = confirmed("PATHOLOGY_GENE");
  const pdl1Clinical = clinicalResults.find((result) => result.result_status === "CONFIRMED" && getNestedRecord(result.result_detail, "pdl1"));
  const pdl1Ai = completedAi("PDL1_ANALYSIS");
  const tps = getNestedRecord(pdl1Clinical?.result_detail, "pdl1")?.tps_percent;
  const predictedRange = getNestedRecord(pdl1Ai?.result_detail, "pdl1")?.predicted_tps_range_label;

  return [
    { label: "TNM 병기", specialist: getStatus(tnmClinical?.result_status_label, tnmClinical?.result_status), ai: getStatus(completedAi("PET_CT_TNM_ANALYSIS")?.status_label, completedAi("PET_CT_TNM_ANALYSIS")?.status) },
    { label: "조직/유전자", specialist: [pathology && "조직", gene && "유전자"].filter(Boolean).join(" · ") || "결과 없음", ai: completedAi("PATHOLOGY_GENE_ANALYSIS") ? "조직 · 유전자" : "결과 없음" },
    { label: "PD-L1", specialist: tps !== undefined && tps !== null ? `TPS ${String(tps)}%` : "결과 없음", ai: predictedRange ? String(predictedRange) : getStatus(pdl1Ai?.status_label, pdl1Ai?.status) },
  ];
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : null;
}

function getStatus(label?: string, status?: string) {
  return label || status || "결과 없음";
}

function Summary({ label, value, tone = "default" }: { label: string; value?: string | null; tone?: "default" | "warning" | "danger" }) {
  const color = tone === "danger" ? "text-rose-700" : tone === "warning" ? "text-amber-700" : "text-slate-700";
  return <div className="min-w-0 px-4 py-2.5"><p className="whitespace-nowrap text-[10px] text-slate-400">{label}</p><p className={`mt-1 truncate text-xs font-bold ${color}`}>{value || "-"}</p></div>;
}
