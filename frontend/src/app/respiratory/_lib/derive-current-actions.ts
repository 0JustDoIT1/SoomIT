export type ActionTarget = "XRAY" | "CT" | "PET_CT_TNM" | "PATHOLOGY_GENE" | "PDL1" | "TREATMENT" | "PRESCRIPTION";

export type CurrentAction = {
  id: string;
  title: string;
  source: "SPECIALIST" | "AI" | "PRESCRIPTION";
  sourceLabel: string;
  status: string;
  href: string;
  target: ActionTarget;
};

type ActionCase = { id: string; current_stage: string; case_status: string };
type ActionClinicalResult = { id?: string; workflow_stage: string; result_status?: string; result_status_label?: string; result_detail?: unknown };
type ActionAiResult = { id?: string; analysis_type: string; status?: string; status_label?: string };
type ActionPrescription = { id: string; prescription_status: string; prescription_status_label?: string };

const STAGE_CONFIG: Record<string, { clinicalTitle: string; aiTitle: string; aiType: string; target: ActionTarget }> = {
  XRAY: { clinicalTitle: "흉부 X선 판독 결과 확인", aiTitle: "흉부 X선 AI 후보 확인", aiType: "XRAY_ANALYSIS", target: "XRAY" },
  CT: { clinicalTitle: "흉부 CT 판독 결과 확인", aiTitle: "흉부 CT AI 후보 확인", aiType: "CT_ANALYSIS", target: "CT" },
  PET_CT_TNM: { clinicalTitle: "TNM 병기 확정 결과 확인", aiTitle: "PET-CT 기반 TNM AI 후보 확인", aiType: "PET_CT_TNM_ANALYSIS", target: "PET_CT_TNM" },
  PATHOLOGY_GENE: { clinicalTitle: "조직·유전자 확정 결과 확인", aiTitle: "조직·유전자 AI 후보 확인", aiType: "PATHOLOGY_GENE_ANALYSIS", target: "PATHOLOGY_GENE" },
  PDL1: { clinicalTitle: "PD-L1 확정 TPS 확인", aiTitle: "PD-L1 AI 후보 확인", aiType: "PDL1_ANALYSIS", target: "PDL1" },
  TREATMENT: { clinicalTitle: "치료 결정 결과 확인", aiTitle: "AI 치료 후보 확인", aiType: "TREATMENT_RECOMMENDATION", target: "TREATMENT" },
};

export function deriveCurrentActions(caseDetail: ActionCase, clinicalResults: ActionClinicalResult[], aiResults: ActionAiResult[], prescriptions: ActionPrescription[]): CurrentAction[] {
  if (caseDetail.case_status !== "ACTIVE") return [];
  const actions: CurrentAction[] = [];
  const config = STAGE_CONFIG[caseDetail.current_stage];
  const clinical = clinicalResults.find((result) => result.workflow_stage === caseDetail.current_stage && Boolean(result.result_status));

  if (config && clinical?.result_status) {
    actions.push({ id: `clinical-${clinical.id ?? caseDetail.current_stage}`, title: config.clinicalTitle, source: "SPECIALIST", sourceLabel: "전문과 의료진 결과", status: clinical.result_status_label ?? clinical.result_status, href: `/respiratory/cases/${caseDetail.id}`, target: config.target });
  }

  const ai = config ? aiResults.find((result) => result.analysis_type === config.aiType && Boolean(result.status)) : undefined;
  if (config && ai?.status) {
    actions.push({ id: `ai-${ai.id ?? config.aiType}`, title: config.aiTitle, source: "AI", sourceLabel: "AI 분석 후보", status: ai.status_label ?? ai.status, href: `/respiratory/cases/${caseDetail.id}`, target: config.target });
  }

  const pdl1Clinical = clinicalResults.find((result) => hasPdl1Detail(result.result_detail) && Boolean(result.result_status));
  const pdl1Ai = aiResults.find((result) => result.analysis_type === "PDL1_ANALYSIS" && Boolean(result.status));
  if (pdl1Clinical?.result_status) {
    actions.push({ id: `clinical-pdl1-${pdl1Clinical.id ?? caseDetail.id}`, title: "PD-L1 확정 TPS 확인", source: "SPECIALIST", sourceLabel: "전문과 의료진 결과", status: pdl1Clinical.result_status_label ?? pdl1Clinical.result_status, href: `/respiratory/cases/${caseDetail.id}`, target: "PDL1" });
  } else if (pdl1Ai?.status) {
    actions.push({ id: `ai-pdl1-${pdl1Ai.id ?? caseDetail.id}`, title: "PD-L1 AI 후보 확인", source: "AI", sourceLabel: "AI 분석 후보", status: pdl1Ai.status_label ?? pdl1Ai.status, href: `/respiratory/cases/${caseDetail.id}`, target: "PDL1" });
  }

  if (caseDetail.current_stage === "PRESCRIPTION") {
    prescriptions.forEach((item) => actions.push({ id: `prescription-${item.id}`, title: "처방 상태 확인", source: "PRESCRIPTION", sourceLabel: "실제 처방", status: item.prescription_status_label ?? item.prescription_status, href: `/respiratory/cases/${caseDetail.id}`, target: "PRESCRIPTION" }));
  }
  return actions;
}

function hasPdl1Detail(detail: unknown) {
  return Boolean(detail && typeof detail === "object" && !Array.isArray(detail) && "pdl1" in detail && (detail as { pdl1?: unknown }).pdl1);
}
