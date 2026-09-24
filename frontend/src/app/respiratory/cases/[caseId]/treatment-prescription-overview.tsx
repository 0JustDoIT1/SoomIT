type TreatmentSummary = {
  treatment_type_label: string | null;
  treatment_type?: string | null;
  requires_prescription?: boolean;
  selected_regimen_detail: { regimen_name: string } | null;
} | null;

type PrescriptionSummary = {
  id: string;
  prescription_status: string;
  safety_check_results: { result: "PASS" | "WARNING" | "BLOCK" }[];
};

type ClinicalEvidence = { workflow_stage: string; result_status?: string; result_status_label?: string; result_detail?: unknown };
type AiEvidence = { analysis_type: string; status?: string; status_label?: string; result_detail?: unknown };

export function TreatmentPrescriptionOverview({ mode = "TREATMENT", treatment, clinicalResults = [], aiResults = [], prescriptionActionable = false }: { mode?: "TREATMENT" | "PRESCRIPTION"; treatment: TreatmentSummary; prescriptions: PrescriptionSummary[]; clinicalResults?: ClinicalEvidence[]; aiResults?: AiEvidence[]; prescriptionActionable?: boolean }) {
  if (mode === "PRESCRIPTION") return <PrescriptionTreatmentSummary treatment={treatment} prescriptionActionable={prescriptionActionable} />;
  const evidence = buildTreatmentEvidence(clinicalResults, aiResults);

  return (
    <section className="mb-2 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex h-9 items-center justify-between border-b border-slate-200 px-4">
        <h2 className="text-sm font-bold text-slate-900">선행 결과 요약</h2>
        <p className="text-[11px] text-slate-500">현재 조회된 확정 결과와 AI 분석 결과를 치료결정 근거로 확인합니다.</p>
      </header>
      <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
        {evidence.slice(2).map((item) => <EvidenceSummary key={item.label} {...item} />)}
      </div><details className="border-t border-slate-100 px-3 py-1 text-xs text-slate-500"><summary className="cursor-pointer">이전 영상 결과 · X-ray / CT</summary><div className="grid grid-cols-2">{evidence.slice(0, 2).map(item => <EvidenceSummary key={item.label} {...item} />)}</div></details>
    </section>
  );
}

function EvidenceSummary({ label, specialist, ai, emphasis = false }: { label: string; specialist: string; ai: string; emphasis?: boolean }) {
  return <div className={`min-w-0 px-3 py-2.5 ${emphasis ? "bg-blue-50/35" : ""}`}><p className={`text-xs font-bold ${emphasis ? "text-blue-800" : "text-slate-700"}`}>{label}</p><div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs"><span className="shrink-0 font-semibold text-emerald-700">확정</span><span className="min-w-0 truncate text-slate-600">{specialist}</span></div><div className="mt-1 flex min-w-0 items-center gap-2 text-xs"><span className="shrink-0 font-semibold text-blue-700">AI</span><span className="min-w-0 truncate text-slate-500">{ai}</span></div></div>;
}

function buildTreatmentEvidence(clinicalResults: ClinicalEvidence[], aiResults: AiEvidence[]) {
  const confirmed = (type: string) => clinicalResults.find((result) => result.workflow_stage === type && result.result_status === "CONFIRMED");
  const completedAi = (type: string) => aiResults.find((result) => result.analysis_type === type && result.status === "SUCCEEDED");
  const tnmClinical = confirmed("PET_CT_TNM");
  const xrayClinical = confirmed("XRAY");
  const ctClinical = confirmed("CT");
  const pathology = confirmed("PATHOLOGY_GENE");
  const gene = confirmed("PATHOLOGY_GENE");
  const pdl1Clinical = clinicalResults.find((result) => result.workflow_stage === "PDL1" && result.result_status === "CONFIRMED" && getNestedRecord(result.result_detail, "pdl1"));
  const pdl1Ai = completedAi("PDL1_ANALYSIS");
  const tps = getNestedRecord(pdl1Clinical?.result_detail, "pdl1")?.tps_percent;
  const predictedRange = getNestedRecord(pdl1Ai?.result_detail, "pdl1")?.predicted_tps_range_label;

  return [
    { label: "흉부 X선", specialist: summaryFrom(xrayClinical?.result_detail, "xray", ["assessment_label", "assessment"]) || getStatus(xrayClinical?.result_status_label, xrayClinical?.result_status), ai: getStatus(completedAi("XRAY_ANALYSIS")?.status_label, completedAi("XRAY_ANALYSIS")?.status) },
    { label: "흉부 CT", specialist: summaryFrom(ctClinical?.result_detail, "ct", ["overall_assessment_label", "overall_assessment", "overall_malignancy_risk"]) || getStatus(ctClinical?.result_status_label, ctClinical?.result_status), ai: getStatus(completedAi("CT_ANALYSIS")?.status_label, completedAi("CT_ANALYSIS")?.status) },
    { label: "PET-CT / TNM", specialist: summaryFrom(tnmClinical?.result_detail, "tnm", ["t_category", "n_category", "m_category", "stage_group"]) || getStatus(tnmClinical?.result_status_label, tnmClinical?.result_status), ai: summaryFrom(completedAi("PET_CT_TNM_ANALYSIS")?.result_detail, "tnm", ["predicted_t", "predicted_n", "predicted_m", "predicted_stage_group"]) || getStatus(completedAi("PET_CT_TNM_ANALYSIS")?.status_label, completedAi("PET_CT_TNM_ANALYSIS")?.status), emphasis: true },
    { label: "조직·유전자", specialist: summaryFrom(pathology?.result_detail, "pathology", ["histologic_type", "subtype"]) || (gene ? "유전자 결과 확인" : "결과 대기"), ai: summaryFrom(completedAi("PATHOLOGY_GENE_ANALYSIS")?.result_detail, "pathology", ["predicted_histologic_type", "predicted_subtype"]) || getStatus(completedAi("PATHOLOGY_GENE_ANALYSIS")?.status_label, completedAi("PATHOLOGY_GENE_ANALYSIS")?.status), emphasis: true },
    { label: "PD-L1", specialist: tps !== undefined && tps !== null ? `TPS ${String(tps)}%` : "결과 대기", ai: predictedRange ? String(predictedRange) : getStatus(pdl1Ai?.status_label, pdl1Ai?.status), emphasis: true },
  ];
}

function PrescriptionTreatmentSummary({ treatment, prescriptionActionable }: { treatment: TreatmentSummary; prescriptionActionable: boolean }) {
  const hasTreatment = Boolean(treatment);
  const requiresPrescription = treatment?.requires_prescription ?? Boolean(treatment?.selected_regimen_detail);
  return <section className="mb-2 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
    <header className="sr-only">
      <h2 className="text-sm font-bold text-slate-900">치료결정 요약</h2>
      <p className="text-[11px] text-slate-500">현재 조회된 치료결정 결과를 기준으로 처방을 준비합니다.</p>
    </header>
    {hasTreatment ? <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
      <TreatmentSummaryItem label="선택 치료법" value={treatment?.treatment_type_label || treatment?.treatment_type || "결과 대기"} />
      <TreatmentSummaryItem label="선택 치료요법" value={treatment?.selected_regimen_detail?.regimen_name || (requiresPrescription ? "결과 대기" : "비약물 치료")} />
      <TreatmentSummaryItem label="치료계획 상태" value={prescriptionActionable ? "최종 확정" : "확정 대기"} emphasis={prescriptionActionable} />
      <TreatmentSummaryItem label={requiresPrescription ? "처방 작성" : "다음 처리"} value={requiresPrescription ? (prescriptionActionable ? "작성 가능" : "치료계획 확정 대기") : (prescriptionActionable ? "종료·의뢰 가능" : "치료계획 확정 대기")} emphasis={prescriptionActionable} />
    </div> : <p className="px-4 py-3 text-xs text-slate-500">현재 조회된 치료결정 결과가 없습니다.</p>}
  </section>;
}

function TreatmentSummaryItem({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={`min-w-0 px-3 py-1.5 ${emphasis ? "bg-emerald-50/40" : ""}`}><p className="text-xs font-bold text-slate-500">{label}</p><p className={`mt-1 truncate text-xs font-semibold ${emphasis ? "text-emerald-700" : "text-slate-700"}`}>{value}</p></div>;
}

function summaryFrom(value: unknown, key: string, fields: string[]) {
  const record = getNestedRecord(value, key);
  if (!record) return "";
  const values = fields.map((field) => record[field]).filter((item) => item !== null && item !== undefined && item !== "").map(String);
  return values.join(" · ");
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : null;
}

function getStatus(label?: string, status?: string) {
  return label || status || "결과 없음";
}
