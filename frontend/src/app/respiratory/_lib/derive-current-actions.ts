export type CurrentAction = { id: string; title: string; source: "SPECIALIST" | "AI" | "PRESCRIPTION"; sourceLabel: string; status: string; href: string };
type ActionCase = { id: string; current_stage: string; case_status: string };
type ActionClinicalResult = { id?: string; exam_type: string; result_status?: string; result_status_label?: string };
type ActionAiResult = { id?: string; analysis_type: string; status?: string; status_label?: string };
type ActionPrescription = { id: string; prescription_status: string; prescription_status_label?: string };
const AI_TYPE_BY_STAGE: Record<string, string> = { XRAY: "XRAY_SCREENING", CT: "CT_NODULE", PATHOLOGY: "PATHOLOGY_DIAGNOSIS", STAGING: "TNM_STAGING", GENE: "GENE_PREDICTION", TREATMENT: "TREATMENT_RECOMMENDATION" };

export function deriveCurrentActions(caseDetail: ActionCase, clinicalResults: ActionClinicalResult[], aiResults: ActionAiResult[], prescriptions: ActionPrescription[]): CurrentAction[] {
  if (caseDetail.case_status !== "ACTIVE") return [];
  const actions: CurrentAction[] = [];
  const clinical = clinicalResults.find((result) => result.exam_type === caseDetail.current_stage);
  if (clinical?.result_status) actions.push({ id: `clinical-${clinical.id ?? caseDetail.current_stage}`, title: clinical.result_status === "CONFIRMED" ? "전문과 확정 결과 확인" : "검사 결과 상태 확인", source: "SPECIALIST", sourceLabel: "전문과 의료진 결과", status: clinical.result_status_label ?? clinical.result_status, href: `/respiratory/results?caseId=${caseDetail.id}` });
  const aiType = AI_TYPE_BY_STAGE[caseDetail.current_stage];
  const ai = aiType ? aiResults.find((result) => result.analysis_type === aiType && Boolean(result.status)) : undefined;
  if (ai?.status) actions.push({ id: `ai-${ai.id ?? aiType}`, title: "AI 후보 결과 확인", source: "AI", sourceLabel: "AI 분석 후보", status: ai.status_label ?? ai.status, href: `/respiratory/ai-analysis?caseId=${caseDetail.id}` });
  if (caseDetail.current_stage === "PRESCRIPTION") prescriptions.forEach((item) => actions.push({ id: `prescription-${item.id}`, title: "처방 상태 확인", source: "PRESCRIPTION", sourceLabel: "실제 처방", status: item.prescription_status_label ?? item.prescription_status, href: `/respiratory/prescriptions?caseId=${caseDetail.id}` }));
  return actions;
}
