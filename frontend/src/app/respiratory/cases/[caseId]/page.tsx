"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useRespiratoryAuth } from "../../_components/respiratory-auth-provider";
import { showToast } from "@/components/ui/toast/toast";
import { API_BASE_URL, type ExaminationOrder } from "../../_lib/respiratory-api";
import { PrescriptionSection, TreatmentSection } from "./treatment-prescription-sections";
import { CaseWorkspaceEmpty } from "./case-workspace-empty";
import { CaseSummaryHeader, CaseWorkflowBar } from "./case-workflow-header";
import { ResultReviewPanel, WorkflowStatusFlow } from "./result-review-panel";
import workspaceStyles from "./workspace.module.css";
import { CaseChatPanel } from "./case-chat-panel";
import { PathologyGeneImagingWorkspace } from "./pathology-gene-imaging-workstation";
import { TnmReviewWorkspace } from "./tnm-review-workspace";
import { CASE_WORKFLOW_STAGES, CaseInfoKey, CaseInfoMenu, getCaseInfoAccessState } from "./case-info-menu";
import { CasePatientSidebar } from "./case-patient-sidebar";
import { getCaseMenuNavigation } from "./case-menu-navigation";
import { CaseOverviewPanel } from "./case-overview-panel";
import { Pdl1ResultPanel } from "./pdl1-imaging-workstation";
import { type Pdl1Result, selectPdl1Results } from "./pdl1-result-mapping";
import { getAiResultHttpError, getAiResultNetworkError } from "./ai-result-errors";
import { getClinicalResultHttpError, getClinicalResultNetworkError } from "./clinical-result-errors";
import { TreatmentPrescriptionOverview } from "./treatment-prescription-overview";
import { TreatmentDecisionPanel } from "./treatment-decision-panel";
import { PrescriptionPanel } from "./prescription-panel";
import { AiSummaryPanel, selectPreferredAiResult } from "./ai-summary-panel";
import { CaseDicomEvidence } from "./case-dicom-evidence";
import { CaseCtSegmentationEvidence } from "./case-ct-segmentation-evidence";
import { CaseImageEvidence } from "./case-image-evidence";
import { CaseWsiEvidence } from "./case-wsi-evidence";
import { KnowledgeRagPanel } from "./knowledge-rag-panel";
import { PatientSafetyDataPanel } from "./patient-safety-data-panel";
import { CaseChangeDialog } from "./case-change-dialog";
import { CaseWorkflowDecision, type WorkflowDecisionCompletion } from "./case-workflow-decision";
import { XrayWorkflowDecision } from "./xray-workflow-decision";
import { CtWorkflowDecision } from "./ct-workflow-decision";
import { StageExaminationOrder } from "./stage-examination-order";
import { CaseConsultationRequest } from "./case-consultation-request";
import { getPrescriptionStatusLabel } from "./clinical-display-labels";
import { MedicationSchedulePanel } from "./medication-schedule-panel";
import { PrescriptionFinalizeScheduleForm, type FinalizeMedicationSchedule } from "./prescription-finalize-schedule-form";
import { hasChangedFields, hasPrescriptionDraftChanges, hasUnsavedCaseChanges as combineUnsavedCaseChanges } from "../../_lib/case-dirty-state";
import { applyCaseResponse, canApplyCaseResponse } from "../../_lib/case-request-guard";
import { CASE_NAVIGATION_REQUEST_EVENT, getRequestedCaseId } from "../../_lib/case-navigation-guard";

type CaseItem = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  patient_sex: string;
  patient_birth_date: string;
  primary_doctor_name: string | null;
  current_stage: string;
  case_status: string;
  created_at: string;
  updated_at: string;
  latest_clinician_decision?: {
    source_stage: string;
    decision_type: string;
    target_stage: string | null;
    reason: string | null;
    decided_by: string;
    decided_at: string;
  } | null;
};

type TnmAnalysisResult = {
  id?: string;
  ai_result_id?: string;
  analysis_type: string;
  analysis_type_label?: string;
  status?: string;
  status_label?: string;
  model_name?: string;
  model_version_name?: string;
  completed_at?: string | null;
  result_detail: {
    ct?: {
      overall_malignancy_risk?: number | string | null;
      nodules?: {
        nodule_no?: number;
        detection_confidence?: number | string | null;
        malignancy_risk?: number | string | null;
        finding_payload?: {
          quantification?: {
            maximum_3d_diameter_mm?: number | null;
            equivalent_diameter_mm?: number | null;
            volume_mm3?: number | null;
            surface_area_mm2?: number | null;
            sphericity?: number | null;
          };
          texture?: {
            prediction?: number | string | { pattern?: string | null } | null;
            prediction_label?: string | null;
          };
          morphology?: {
            spiculation?: { prediction?: string | null } | null;
            lobulation?: { prediction?: string | null } | null;
            prediction?: { spiculation?: string | null; lobulation?: string | null } | null;
          };
          malignancy?: {
            prediction?: {
              probability?: number | string | null;
              malignancy_score?: number | string | null;
              prediction?: string | null;
            } | null;
          };
        } | null;
      }[];
    };
    tnm?: {
      predicted_t: string | null;
      predicted_n: string | null;
      predicted_m: string | null;
      predicted_stage_group: string | null;
      confidence: number | string | null;
      result_payload?: { t?: Record<string, unknown>; n?: Record<string, unknown>; m?: Record<string, unknown> };
    };
    genes?: {
      gene_symbol?: string;
      predicted_status?: string;
      predicted_status_label?: string;
      predicted_probability?: number | string | null;
    }[];
  } | null;
};

type TnmClinicalResult = {
  id?: string;
  workflow_stage: string;
  exam_name?: string;
  result_status?: string;
  result_status_label?: string;
  result_date?: string | null;
  result_detail: {
    ct?: {
      overall_assessment?: string | null;
    };
    tnm?: {
      t_category: string | null;
      n_category: string | null;
      m_category: string | null;
      stage_group: string | null;
      evidence: {
        stage?: {
          ctnm_candidate?: string | null;
          stage_group_candidate?: string | null;
          stage_group_status?: string | null;
          warnings?: string[];
        };
      } | null;
      note: string | null;
    };
  };
};

function formatAiTnm(value: Partial<NonNullable<NonNullable<TnmAnalysisResult["result_detail"]>["tnm"]>> & { result_payload?: { t?: Record<string, unknown>; n?: Record<string, unknown>; m?: Record<string, unknown> }; ai_result_id?: string }) {
  const payload = value?.result_payload;
  const t = payload?.t; const n = payload?.n; const m = payload?.m;
  return { ...value, predicted_t: t ? (t.t_candidate ? String(t.t_candidate) : t.size_only_t_candidate ? `크기 기준 후보 ${t.size_only_t_candidate}` : "판정 후보 없음") : value?.predicted_t, predicted_n: n ? `${n.nplus_probability == null ? "-" : `${(Number(n.nplus_probability) * 100).toFixed(1)}%`} · ${n.risk_tier ?? "위험도 미정"}${n.may_assign_cn === false ? " · cN 직접 할당 불가" : ""}` : value?.predicted_n, predicted_m: m ? (m.m_candidate === "M_indeterminate" ? "M 판정 보류" : String(m.m_candidate ?? "판정 후보 없음")) : value?.predicted_m };
}

type GeneClinicalResult = {
  id?: string;
  workflow_stage: string;
  result_status?: string;
  result_status_label?: string;
  result_date: string | null;
  result_detail: {
    pathology?: {
      malignancy_status_label?: string | null;
      histologic_type?: string | null;
      subtype?: string | null;
    };
    gene?: {
      interpretation: string | null;
      additional_test_recommended: boolean;
      findings: {
        gene_symbol: string;
        assessment: string;
        assessment_label: string;
        source_assessment?: string;
        source_assessment_label?: string;
        alteration_code?: string | null;
        note: string | null;
      }[];
    };
    pdl1?: {
      tps_percent: number | string | null;
      interpretation: string | null;
      note: string | null;
    };
  };
};

type Pdl1ClinicalResult = {
  id?: string;
  workflow_stage: string;
  result_status?: string;
  result_date: string | null;
  result_detail: {
    pdl1?: {
      tps_percent: number | string | null;
      interpretation: string | null;
      note: string | null;
    };
  };
};

type RegimenCandidateDetail = {
  id: string;
  regimen_code: string;
  regimen_name: string;
  cancer_type: string;
  histology: string | null;
  treatment_line: string | null;
  cycle_length_days: number | null;
  induction_cycles: number | null;
  maintenance_yn: boolean;
  source: string | null;
  source_version: string | null;
};

type CaseRegimenCandidate = {
  id: string;
  priority: number;
  regimen_detail: RegimenCandidateDetail;
  match_reasons: string[];
};

type TreatmentAnalysisResult = {
  analysis_type: string;
  result_detail: {
    treatment?: {
      overall_opinion: string;
      recommended_plan: string;
      targeted_therapy_recommendation: string | null;
      prescription_draft: Record<string, unknown> | null;
      rationale: string | null;
      evidence: unknown;
    };
  } | null;
};

type CaseTreatmentDecision = {
  decision_status?: string | null;
  ai_recommendation_action: string | null;
  ai_recommendation_action_label: string | null;
  treatment_type: string | null;
  treatment_type_label: string | null;
  requires_prescription?: boolean;
  selected_regimen: string | null;
  selected_regimen_detail: RegimenCandidateDetail | null;
  treatment_plan: string | null;
  targeted_therapy_plan: string | null;
  rationale: string | null;
};

type CaseTreatmentForm = {
  treatment_type: string;
  selected_regimen: string;
  treatment_plan: string;
  targeted_therapy_plan: string;
  rationale: string;
};

type CasePrescriptionItem = {
  id: string;
  drug_name: string;
  ingredient_name: string;
  calculated_dose: string | number | null;
  final_dose: string | number | null;
  unit: string | null;
  route: string;
  route_label: string;
  administration_day: string | null;
  frequency: string | null;
  instructions: string | null;
};

type CaseSafetyResult = {
  id: string;
  check_type: string;
  check_type_label: string;
  result: "PASS" | "WARNING" | "BLOCK";
  result_label: string;
  message: string;
  acknowledged_by_user: string | null;
  acknowledged_at: string | null;
  acknowledgment_note: string | null;
};

type CasePrescription = {
  id: string;
  regimen_detail: RegimenCandidateDetail;
  cycle_number: number;
  phase: string;
  phase_label: string;
  cycle_start_date: string;
  prescription_status: string;
  prescription_status_label: string;
  items: CasePrescriptionItem[];
  safety_check_results: CaseSafetyResult[];
  created_at: string;
  updated_at: string;
};

type MainMenu =
  | "RESULTS"
  | "AI"
  | "TREATMENT"
  | "PRESCRIPTION";

type ResultSubMenu =
  | "XRAY"
  | "CT"
  | "PATHOLOGY_GENE"
  | "PET_CT_TNM"
  | "PDL1";

type AiSubMenu =
  | "XRAY"
  | "CT"
  | "PATHOLOGY_GENE"
  | "PET_CT_TNM"
  | "PDL1";

type TreatmentSubMenu =
  | "AI_RECOMMENDATION"
  | "REGIMEN"
  | "FINAL_PLAN";

type PrescriptionSubMenu =
  | "PRESCRIPTION_LIST"
  | "SAFETY_CHECK"
  | "FINAL_PRESCRIPTION";

const mainMenus: {
  key: MainMenu;
  label: string;
  description: string;
}[] = [
  {
    key: "RESULTS",
    label: "검사 결과",
    description: "확정 임상 결과",
  },
  {
    key: "AI",
    label: "AI 분석",
    description: "AI 예측 및 비교",
  },
  {
    key: "TREATMENT",
    label: "치료 결정",
    description: "Regimen 및 치료계획",
  },
  {
    key: "PRESCRIPTION",
    label: "처방 관리",
    description: "처방 및 안전성 검사",
  },
];

const resultSubMenus: {
  key: ResultSubMenu;
  label: string;
}[] = [
  {
    key: "XRAY",
    label: "X-ray",
  },
  {
    key: "CT",
    label: "CT",
  },
  {
    key: "PATHOLOGY_GENE",
    label: "병리",
  },
  {
    key: "PET_CT_TNM",
    label: "TNM",
  },
  {
    key: "PATHOLOGY_GENE",
    label: "PD-L1",
  },
];

const aiSubMenus: {
  key: AiSubMenu;
  label: string;
}[] = [
  {
    key: "XRAY",
    label: "X-ray",
  },
  {
    key: "CT",
    label: "CT",
  },
  {
    key: "PATHOLOGY_GENE",
    label: "병리",
  },
  {
    key: "PET_CT_TNM",
    label: "TNM",
  },
  {
    key: "PATHOLOGY_GENE",
    label: "PD-L1",
  },
];

const treatmentSubMenus: {
  key: TreatmentSubMenu;
  label: string;
}[] = [
  {
    key: "AI_RECOMMENDATION",
    label: "AI 치료 추천",
  },
  {
    key: "REGIMEN",
    label: "치료요법 후보",
  },
  {
    key: "FINAL_PLAN",
    label: "최종 치료계획",
  },
];

const prescriptionSubMenus: {
  key: PrescriptionSubMenu;
  label: string;
}[] = [
  {
    key: "PRESCRIPTION_LIST",
    label: "처방 목록",
  },
  {
    key: "SAFETY_CHECK",
    label: "안전성 검사",
  },
  {
    key: "FINAL_PRESCRIPTION",
    label: "최종 처방",
  },
];

const workspaceMainMenus: typeof mainMenus = [
  { key: "RESULTS", label: "검사·결과", description: "전문과 확정 결과" },
  { key: "AI", label: "AI 분석 · TNM 검토", description: "AI 후보와 의료진 비교" },
  { key: "TREATMENT", label: "치료 계획", description: "치료요법 및 치료 결정" },
  { key: "PRESCRIPTION", label: "처방", description: "처방 및 안전성 검사" },
];
const workspaceResultSubMenus: typeof resultSubMenus = [
  { key: "XRAY", label: "흉부 X선" }, { key: "CT", label: "흉부 CT" }, { key: "PET_CT_TNM", label: "PET-CT / TNM 병기" }, { key: "PATHOLOGY_GENE", label: "조직/유전자" }, { key: "PDL1", label: "PD-L1" },
];
const workspaceAiSubMenus: typeof aiSubMenus = [
  { key: "XRAY", label: "흉부 X선" }, { key: "CT", label: "흉부 CT" }, { key: "PET_CT_TNM", label: "PET-CT / TNM 병기" }, { key: "PATHOLOGY_GENE", label: "조직/유전자" }, { key: "PDL1", label: "PD-L1" },
];
const workspaceTreatmentSubMenus: typeof treatmentSubMenus = [
  { key: "AI_RECOMMENDATION", label: "AI 치료 추천" }, { key: "REGIMEN", label: "치료요법 후보" }, { key: "FINAL_PLAN", label: "최종 치료계획" },
];
const workspacePrescriptionSubMenus: typeof prescriptionSubMenus = [
  { key: "PRESCRIPTION_LIST", label: "처방 목록" }, { key: "SAFETY_CHECK", label: "안전성 검사" }, { key: "FINAL_PRESCRIPTION", label: "최종 처방" },
];
// 기존 메뉴 상수는 기존 화면 동작과 타입 호환성을 위해 보존합니다.
void [mainMenus, resultSubMenus, aiSubMenus, treatmentSubMenus, prescriptionSubMenus];

export default function RespiratoryCaseDetailPage() {
  const searchParams = useSearchParams();
  const params = useParams();
  const router = useRouter();
  const { user, authorizedFetch } = useRespiratoryAuth();

  const caseId = params.caseId as string;

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [selectedCase, setSelectedCase] =
    useState<CaseItem | null>(null);
  const [caseRefreshVersion, setCaseRefreshVersion] = useState(0);
  const [treatmentView, setTreatmentView] = useState<{ caseId: string; tab: "TREATMENT" | "PRESCRIPTION" } | null>(null);
  const [lastResultSyncAt, setLastResultSyncAt] = useState<Date | null>(null);
  const [resultsSyncing, setResultsSyncing] = useState(false);
  const [resultSyncNotice, setResultSyncNotice] = useState("");
  const [stageOrderNotice, setStageOrderNotice] = useState("");
  const [confirmingPathologyResult, setConfirmingPathologyResult] = useState(false);

  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);

  const [selectedMainMenu, setSelectedMainMenu] =
  useState<MainMenu>("AI");
  const [selectedInfoMenu, setSelectedInfoMenu] = useState<CaseInfoKey>("OVERVIEW");

  const [expandedMainMenu, setExpandedMainMenu] =
  useState<MainMenu | null>("AI");

  const [selectedResultMenu, setSelectedResultMenu] =
  useState<ResultSubMenu>("XRAY");
  const [ctViewerVisitedCaseId, setCtViewerVisitedCaseId] = useState<string | null>(null);
  const selectResultMenu = useCallback((menu: ResultSubMenu) => {
    if (menu === "CT") setCtViewerVisitedCaseId(caseId);
    setSelectedResultMenu(menu);
  }, [caseId]);

  const [selectedAiMenu, setSelectedAiMenu] =
  useState<AiSubMenu>("PET_CT_TNM");

  const [pdl1Results, setPdl1Results] =
  useState<Pdl1Result[]>([]);

  const [tnmAnalysisResults, setTnmAnalysisResults] =
  useState<TnmAnalysisResult[]>([]);

  const [tnmClinicalResults, setTnmClinicalResults] =
  useState<TnmClinicalResult[]>([]);

  const [regimenCandidates, setRegimenCandidates] =
  useState<CaseRegimenCandidate[]>([]);
  const [regimenCandidatesLoading, setRegimenCandidatesLoading] =
  useState(false);

  const [caseTreatmentDecision, setCaseTreatmentDecision] =
  useState<CaseTreatmentDecision | null>(null);

  const [caseTreatmentForm, setCaseTreatmentForm] =
  useState<CaseTreatmentForm>({
    treatment_type: "",
    selected_regimen: "",
    treatment_plan: "",
    targeted_therapy_plan: "",
    rationale: "",
  });

  const [caseTreatmentSaving, setCaseTreatmentSaving] =
  useState(false);
  const [caseTreatmentConfirming, setCaseTreatmentConfirming] =
  useState(false);
  const [caseTreatmentConfirmed, setCaseTreatmentConfirmed] =
  useState(false);
  const [caseTreatmentError, setCaseTreatmentError] =
  useState("");
  const [caseTreatmentMessage, setCaseTreatmentMessage] =
  useState("");

  const [casePrescriptions, setCasePrescriptions] =
  useState<CasePrescription[]>([]);
  const [caseOrders, setCaseOrders] = useState<ExaminationOrder[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [casePrescriptionCycleNumber, setCasePrescriptionCycleNumber] =
  useState("1");
  const [casePrescriptionPhase, setCasePrescriptionPhase] =
  useState("INDUCTION");
  const [casePrescriptionCycleStartDate, setCasePrescriptionCycleStartDate] =
  useState("");
  const [casePrescriptionWorking, setCasePrescriptionWorking] =
  useState(false);
  const [casePrescriptionError, setCasePrescriptionError] =
  useState("");
  const [casePrescriptionMessage, setCasePrescriptionMessage] =
  useState("");
  const [regimenLoadError, setRegimenLoadError] = useState("");
  const [treatmentLoadError, setTreatmentLoadError] = useState("");
  const [prescriptionLoadError, setPrescriptionLoadError] = useState("");
  const [panelRetrying, setPanelRetrying] = useState<"AI" | "CLINICAL" | "REGIMEN" | "TREATMENT" | "PRESCRIPTION" | null>(null);
  const activeCaseIdRef = useRef(caseId);
  const regimenRequestVersionRef = useRef(0);
  const resultSignatureRef = useRef("");
  const resultRefreshRequestRef = useRef(0);
  const aiToastStatusRef = useRef(new Map<string, string>());
  activeCaseIdRef.current = caseId;

  useEffect(() => {
    for (const result of tnmAnalysisResults) {
      const status = result.status ?? "";
      const resultKey = result.ai_result_id ?? result.id ?? result.analysis_type;
      const previousStatus = aiToastStatusRef.current.get(resultKey);
      if (!status || previousStatus === status) continue;
      aiToastStatusRef.current.set(resultKey, status);
      const toastId = `case-ai-status-${caseId}-${resultKey}`;
      if (status === "PENDING") showToast.info("AI 분석이 시작되었습니다.", { id: toastId });
      else if (status === "RUNNING") showToast.info("AI 분석이 진행 중입니다.", { id: toastId });
      else if (status === "FAILED") showToast.error("AI 분석에 실패했습니다.", { id: toastId });
      else if (status === "SUCCEEDED" && previousStatus) showToast.success("AI 분석이 완료되었습니다.", { id: toastId });
    }
  }, [caseId, tnmAnalysisResults]);

  const refreshCaseResults = useCallback(async () => {
    const requestVersion = ++resultRefreshRequestRef.current;
    setResultsSyncing(true);
    try {
      const [caseResponse, aiResponse, clinicalResponse, ordersResponse] = await Promise.all([
        authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/`),
        authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/ai-results/`),
        authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/clinical-results/`),
        authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/orders/`),
      ]);
      if (!caseResponse.ok || !aiResponse.ok || !clinicalResponse.ok || !ordersResponse.ok) {
        throw new Error("Case workflow refresh failed.");
      }
      const [casePayload, aiPayload, clinicalPayload, ordersPayload] = await Promise.all([
        caseResponse.json(),
        aiResponse.json(),
        clinicalResponse.json(),
        ordersResponse.json(),
      ]);
      if (
        !casePayload || typeof casePayload !== "object" || Array.isArray(casePayload)
        || !Array.isArray(aiPayload) || !Array.isArray(clinicalPayload) || !Array.isArray(ordersPayload)
      ) {
        throw new Error("Case workflow refresh returned an invalid payload.");
      }
      if (requestVersion !== resultRefreshRequestRef.current || !canApplyCaseResponse(caseId, activeCaseIdRef.current, false)) return;
      const updatedCase = casePayload as CaseItem;
      setSelectedCase(updatedCase);
      setCases((current) => current.map((item) => item.id === updatedCase.id ? updatedCase : item));
      setTnmAnalysisResults(aiPayload as TnmAnalysisResult[]);
      setPdl1Results(selectPdl1Results(aiPayload));
      setTnmClinicalResults(clinicalPayload as TnmClinicalResult[]);
      setCaseOrders(ordersPayload as ExaminationOrder[]);
      setOrdersLoaded(true);
      const signature = `${caseId}:${updatedCase.current_stage}:${resultSyncSignature(aiPayload)}:${resultSyncSignature(clinicalPayload)}:${orderSyncSignature(ordersPayload)}`;
      const previousSignature = resultSignatureRef.current;
      if (previousSignature.startsWith(`${caseId}:`) && previousSignature !== signature) {
        setResultSyncNotice("새 결과 또는 검사 예약 정보가 반영되었습니다.");
        window.setTimeout(() => setResultSyncNotice(""), 6000);
      }
      resultSignatureRef.current = signature;
      setLastResultSyncAt(new Date());
    } catch (cause) {
      console.error(cause);
      if (requestVersion === resultRefreshRequestRef.current && canApplyCaseResponse(caseId, activeCaseIdRef.current, false)) {
        showToast.error("최신 Workflow 정보를 불러오지 못했습니다.", { id: `case-results-refresh-${caseId}` });
      }
    } finally {
      if (requestVersion === resultRefreshRequestRef.current && canApplyCaseResponse(caseId, activeCaseIdRef.current, false)) setResultsSyncing(false);
    }
  }, [authorizedFetch, caseId]);

  const [selectedTreatmentMenu, setSelectedTreatmentMenu] =
  useState<TreatmentSubMenu>("FINAL_PLAN");

  const [selectedPrescriptionMenu, setSelectedPrescriptionMenu] =
  useState<PrescriptionSubMenu>("PRESCRIPTION_LIST");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clinicalResultError, setClinicalResultError] = useState("");
  const [aiResultError, setAiResultError] = useState("");
  const [tnmDirty, setTnmDirty] = useState(false);
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null);
  const [prescriptionItemDirty, setPrescriptionItemDirty] = useState<Record<string, boolean>>({});
  const caseTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (caseId) window.localStorage.setItem("respiratory-last-case-id", caseId);
  }, [caseId]);

  const treatmentBaseline = {
    treatment_type: caseTreatmentDecision?.treatment_type ?? "",
    selected_regimen: caseTreatmentDecision?.selected_regimen ?? "",
    treatment_plan: caseTreatmentDecision?.treatment_plan ?? "",
    targeted_therapy_plan: caseTreatmentDecision?.targeted_therapy_plan ?? "",
    rationale: caseTreatmentDecision?.rationale ?? "",
  };
  const hasUnsavedTreatmentDraft = hasChangedFields({ ...caseTreatmentForm }, treatmentBaseline);
  const hasUnsavedPrescriptionDraft = hasPrescriptionDraftChanges({ cycleNumber: casePrescriptionCycleNumber, phase: casePrescriptionPhase, cycleStartDate: casePrescriptionCycleStartDate, itemDirty: prescriptionItemDirty });
  const hasUnacknowledgedWarnings = casePrescriptions.some((prescription) => prescription.safety_check_results.some((result) => result.result === "WARNING" && !result.acknowledged_at));
  const hasUnsavedCaseChanges = combineUnsavedCaseChanges({ tnm: tnmDirty, treatment: hasUnsavedTreatmentDraft, prescription: hasUnsavedPrescriptionDraft, unacknowledgedWarnings: hasUnacknowledgedWarnings });

  useEffect(() => {
    if (!hasUnsavedCaseChanges) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers intentionally show their own localized confirmation message.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedCaseChanges]);

  useEffect(() => {
    const interceptCaseNavigation = (event: Event) => {
      const requestedCaseId = getRequestedCaseId(event);
      if (!requestedCaseId || requestedCaseId === caseId || !hasUnsavedCaseChanges) return;

      caseTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPendingCaseId(requestedCaseId);
      event.preventDefault();
    };
    window.addEventListener(CASE_NAVIGATION_REQUEST_EVENT, interceptCaseNavigation);
    return () => window.removeEventListener(CASE_NAVIGATION_REQUEST_EVENT, interceptCaseNavigation);
  }, [caseId, hasUnsavedCaseChanges]);

  useEffect(() => {
    const controller = new AbortController();
    const applyCurrentResponse = (apply: () => void) => applyCaseResponse(caseId, activeCaseIdRef.current, controller.signal.aborted, apply);
    const regimenRequestVersion = ++regimenRequestVersionRef.current;
    const isLatestRegimenRequest = () => (
      regimenRequestVersion === regimenRequestVersionRef.current
      && canApplyCaseResponse(caseId, activeCaseIdRef.current, controller.signal.aborted)
    );
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");
        setCaseTreatmentConfirmed(false);
        setCasePrescriptionError("");
        setCasePrescriptionMessage("");
        setCasePrescriptions([]);
        setTnmAnalysisResults([]);
        setTnmClinicalResults([]);
        setResultSyncNotice("");
        setRegimenCandidates([]);
        setRegimenCandidatesLoading(true);
        setCaseTreatmentDecision(null);
        setCaseOrders([]);
        setOrdersLoaded(false);
        setPrescriptionItemDirty({});
        setCasePrescriptionCycleNumber("1");
        setCasePrescriptionPhase("INDUCTION");
        setCasePrescriptionCycleStartDate("");
        setClinicalResultError("");
        setAiResultError("");
        setRegimenLoadError("");
        setTreatmentLoadError("");
        setPrescriptionLoadError("");

        const [caseListResponse, caseDetailResponse] =
          await Promise.all([
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/`, { signal: controller.signal }),
          ]);

        if (!caseListResponse.ok) {
          throw new Error(
            "담당 Case 목록을 불러오지 못했습니다."
          );
        }

        if (!caseDetailResponse.ok) {
          throw new Error(
            "선택한 Case 정보를 불러오지 못했습니다."
          );
        }

        const caseListData: CaseItem[] =
          await caseListResponse.json();

        const caseDetailData: CaseItem =
          await caseDetailResponse.json();

        if (canApplyCaseResponse(caseId, activeCaseIdRef.current, controller.signal.aborted)) {
          setCases(caseListData);
          setSelectedCase(caseDetailData);
          setLoading(false);
          setPdl1Results([]);
        }

        const [tnmAnalysisRequest, tnmClinicalRequest, regimenCandidateRequest, treatmentDecisionRequest, prescriptionRequest, ordersRequest] =
          await Promise.allSettled([
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/ai-results/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/clinical-results/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/regimen-candidates/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/treatment-decision/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/orders/`, { signal: controller.signal }),
          ]);

        // Effect cleanup intentionally aborts every in-flight request. Do not
        // turn that lifecycle cancellation into panel errors, toasts, or noisy
        // AbortError console reports.
        if (controller.signal.aborted) return;

        if (tnmAnalysisRequest.status === "fulfilled" && tnmAnalysisRequest.value.ok) {
          const tnmAnalysisResponse = tnmAnalysisRequest.value;
          const aiAnalysisPayload: unknown = await tnmAnalysisResponse.json();
          const tnmAnalysisData = Array.isArray(aiAnalysisPayload)
            ? aiAnalysisPayload as TnmAnalysisResult[]
            : [];

          applyCurrentResponse(() => {
            setTnmAnalysisResults(tnmAnalysisData);
            setPdl1Results(selectPdl1Results(aiAnalysisPayload));
          });
        } else {
          const failure = tnmAnalysisRequest.status === "rejected" ? tnmAnalysisRequest.reason : new Error(`AI results HTTP ${tnmAnalysisRequest.value.status}`);
          console.error(failure);
          applyCurrentResponse(() => showToast.error("AI 분석 결과를 불러오지 못했습니다.", { id: `case-load-ai-${caseId}` }));
          applyCurrentResponse(() => setAiResultError(
            tnmAnalysisRequest.status === "fulfilled"
              ? getAiResultHttpError(tnmAnalysisRequest.value.status)
              : getAiResultNetworkError(),
          ));
        }

        if (tnmClinicalRequest.status === "fulfilled" && tnmClinicalRequest.value.ok) {
          const tnmClinicalResponse = tnmClinicalRequest.value;
          const tnmClinicalData: TnmClinicalResult[] =
            await tnmClinicalResponse.json();

          applyCurrentResponse(() => setTnmClinicalResults(tnmClinicalData));
        } else {
          const failure = tnmClinicalRequest.status === "rejected" ? tnmClinicalRequest.reason : new Error(`Clinical results HTTP ${tnmClinicalRequest.value.status}`);
          console.error(failure);
          applyCurrentResponse(() => showToast.error("확정 결과를 불러오지 못했습니다.", { id: `case-load-clinical-${caseId}` }));
          applyCurrentResponse(() => setClinicalResultError(
            tnmClinicalRequest.status === "fulfilled"
              ? getClinicalResultHttpError(tnmClinicalRequest.value.status)
              : getClinicalResultNetworkError(),
          ));
        }

        if (regimenCandidateRequest.status === "fulfilled" && regimenCandidateRequest.value.ok) {
          const regimenCandidateResponse = regimenCandidateRequest.value;
          const regimenCandidateData: CaseRegimenCandidate[] =
            await regimenCandidateResponse.json();

          if (isLatestRegimenRequest()) {
            setRegimenCandidates(regimenCandidateData);
            setRegimenCandidatesLoading(false);
          }
        } else {
          if (isLatestRegimenRequest()) {
            setRegimenCandidatesLoading(false);
            setRegimenLoadError(
              regimenCandidateRequest.status === "fulfilled"
                ? getPanelFetchError(regimenCandidateRequest.value.status, "치료요법 후보")
                : "치료요법 후보 조회 중 네트워크 오류가 발생했습니다.",
            );
          }
        }

        if (treatmentDecisionRequest.status === "fulfilled" && treatmentDecisionRequest.value.ok) {
          const treatmentDecisionResponse = treatmentDecisionRequest.value;
          const treatmentDecisionData: CaseTreatmentDecision =
            await treatmentDecisionResponse.json();

          if (!canApplyCaseResponse(caseId, activeCaseIdRef.current, controller.signal.aborted)) return;
          setCaseTreatmentDecision(treatmentDecisionData);
          setCaseTreatmentForm({
            treatment_type: treatmentDecisionData.treatment_type ?? "",
            selected_regimen:
              treatmentDecisionData.selected_regimen ?? "",
            treatment_plan: treatmentDecisionData.treatment_plan ?? "",
            targeted_therapy_plan:
              treatmentDecisionData.targeted_therapy_plan ?? "",
            rationale: treatmentDecisionData.rationale ?? "",
          });
        } else if (treatmentDecisionRequest.status === "fulfilled" && treatmentDecisionRequest.value.status === 404) {
          applyCurrentResponse(() => {
            setCaseTreatmentDecision(null);
            setCaseTreatmentForm({ treatment_type: "", selected_regimen: "", treatment_plan: "", targeted_therapy_plan: "", rationale: "" });
          });
        } else {
          applyCurrentResponse(() => setTreatmentLoadError(
            treatmentDecisionRequest.status === "fulfilled"
              ? getPanelFetchError(treatmentDecisionRequest.value.status, "치료 결정")
              : "치료 결정 조회 중 네트워크 오류가 발생했습니다.",
          ));
        }

        if (prescriptionRequest.status === "fulfilled" && prescriptionRequest.value.ok) {
          const prescriptionResponse = prescriptionRequest.value;
          const prescriptionData: CasePrescription[] =
            await prescriptionResponse.json();

          applyCurrentResponse(() => setCasePrescriptions(prescriptionData));
        } else {
          const failure = prescriptionRequest.status === "rejected" ? prescriptionRequest.reason : new Error(`Prescriptions HTTP ${prescriptionRequest.value.status}`);
          console.error(failure);
          applyCurrentResponse(() => showToast.error("처방 목록을 불러오지 못했습니다.", { id: `case-load-prescriptions-${caseId}` }));
          applyCurrentResponse(() => setPrescriptionLoadError(
            prescriptionRequest.status === "fulfilled"
              ? getPanelFetchError(prescriptionRequest.value.status, "처방 목록")
              : "처방 목록 조회 중 네트워크 오류가 발생했습니다.",
          ));
        }

        if (ordersRequest.status === "fulfilled" && ordersRequest.value.ok) {
          const ordersPayload: unknown = await ordersRequest.value.json();
          applyCurrentResponse(() => {
            setCaseOrders(Array.isArray(ordersPayload) ? ordersPayload as ExaminationOrder[] : []);
            setOrdersLoaded(true);
          });
        } else {
          const failure = ordersRequest.status === "rejected" ? ordersRequest.reason : new Error(`Orders HTTP ${ordersRequest.value.status}`);
          console.error(failure);
          applyCurrentResponse(() => showToast.error("검사 오더를 불러오지 못했습니다.", { id: `case-load-orders-${caseId}` }));
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        applyCurrentResponse(() => showToast.error("Case 정보를 불러오지 못했습니다.", { id: `case-load-${caseId}` }));
        applyCurrentResponse(() => setError(
          err instanceof Error
            ? err.message
            : "Case 조회 중 오류가 발생했습니다."
        ));
        if (isLatestRegimenRequest()) setRegimenCandidatesLoading(false);
      } finally {
        applyCurrentResponse(() => setLoading(false));
      }
    };

    if (caseId) {
      fetchData();
    }
    return () => controller.abort();
  }, [authorizedFetch, caseId, caseRefreshVersion]);

  useEffect(() => {
    if (!caseId) return;
    let disposed = false;
    let polling = false;
    const pollResults = async () => {
      if (polling || document.hidden) return;
      polling = true;
      try {
        await refreshCaseResults();
      } catch {
        // Keep the last confirmed screen state on a transient background refresh failure.
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(() => { if (!disposed) void pollResults(); }, 30_000);
    const refreshWhenVisible = () => {
      if (!document.hidden && !disposed) void pollResults();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [caseId, refreshCaseResults]);

  const filteredCases = cases.filter((item) => {
    const keyword = deferredSearchText.trim().toLowerCase();

    if (!keyword) {
      return true;
    }

    return (
      item.patient_name.toLowerCase().includes(keyword) ||
      item.patient_code.toLowerCase().includes(keyword) ||
      item.case_code.toLowerCase().includes(keyword)
    );
  }).filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);

  const handleCaseSelect = (id: string) => {
    if (id === caseId) {
      return;
    }

    if (hasUnsavedCaseChanges) {
      caseTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPendingCaseId(id);
      return;
    }
    router.push(`/respiratory/cases/${id}`);
  };

  const discardDraftAndMove = () => {
    if (!pendingCaseId) return;
    const nextCaseId = pendingCaseId;
    setPendingCaseId(null);
    setTnmDirty(false);
    setPrescriptionItemDirty({});
    router.push(`/respiratory/cases/${nextCaseId}`);
  };

  const retryPanel = async (panel: "REGIMEN" | "TREATMENT" | "PRESCRIPTION") => {
    const requestCaseId = caseId;
    const toastId = `case-panel-retry-${requestCaseId}-${panel}`;
    let regimenRetryVersion: number | null = null;
    setPanelRetrying(panel);
    showToast.info("정보를 다시 불러오고 있습니다.", { id: toastId });
    try {
      if (panel === "REGIMEN") {
        regimenRetryVersion = ++regimenRequestVersionRef.current;
        setRegimenLoadError("");
        setRegimenCandidatesLoading(true);
        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${requestCaseId}/regimen-candidates/`);
        if (!response.ok) throw new Error(getPanelFetchError(response.status, "치료요법 후보"));
        const data: CaseRegimenCandidate[] = await response.json();
        if (regimenRetryVersion === regimenRequestVersionRef.current && canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) {
          setRegimenCandidates(data);
          setRegimenCandidatesLoading(false);
        }
      } else if (panel === "TREATMENT") {
        setTreatmentLoadError("");
        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${requestCaseId}/treatment-decision/`);
        if (response.status === 404) {
          if (canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) setCaseTreatmentDecision(null);
          showToast.success("치료 결정 정보를 다시 확인했습니다.", { id: toastId });
          return;
        }
        if (!response.ok) throw new Error(getPanelFetchError(response.status, "치료 결정"));
        const data: CaseTreatmentDecision = await response.json();
        if (canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) {
          setCaseTreatmentDecision(data);
          setCaseTreatmentForm({ treatment_type: data.treatment_type ?? "", selected_regimen: data.selected_regimen ?? "", treatment_plan: data.treatment_plan ?? "", targeted_therapy_plan: data.targeted_therapy_plan ?? "", rationale: data.rationale ?? "" });
        }
      } else {
        setPrescriptionLoadError("");
        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${requestCaseId}/prescriptions/`);
        if (!response.ok) throw new Error(getPanelFetchError(response.status, "처방 목록"));
        const data: CasePrescription[] = await response.json();
        if (canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) setCasePrescriptions(data);
      }
      showToast.success("정보를 다시 불러왔습니다.", { id: toastId });
    } catch (retryError) {
      if (!canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) return;
      console.error(retryError);
      const message = retryError instanceof Error ? retryError.message : "패널 조회에 실패했습니다.";
      if (panel === "REGIMEN" && regimenRetryVersion === regimenRequestVersionRef.current) {
        setRegimenCandidatesLoading(false);
        setRegimenLoadError(message);
      }
      else if (panel === "TREATMENT") setTreatmentLoadError(message);
      else setPrescriptionLoadError(message);
      showToast.error("정보를 다시 불러오지 못했습니다.", { id: toastId });
    } finally {
      if (canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) setPanelRetrying(null);
    }
  };

  const retryAiResults = async () => {
    const requestCaseId = caseId;
    const toastId = `case-ai-retry-${requestCaseId}`;
    setPanelRetrying("AI");
    setAiResultError("");
    showToast.info("AI 분석 결과를 다시 불러오고 있습니다.", { id: toastId });

    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${requestCaseId}/ai-results/`);
      if (!response.ok) throw new Error(getAiResultHttpError(response.status));

      const payload: unknown = await response.json();
      if (!canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) return;

      setTnmAnalysisResults(Array.isArray(payload) ? payload as TnmAnalysisResult[] : []);
      setPdl1Results(selectPdl1Results(payload));
      showToast.success("AI 분석 결과를 다시 불러왔습니다.", { id: toastId });
    } catch (retryError) {
      if (!canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) return;
      console.error(retryError);
      setAiResultError(
        retryError instanceof TypeError
          ? getAiResultNetworkError()
          : retryError instanceof Error
            ? retryError.message
            : getAiResultNetworkError(),
      );
      showToast.error("AI 분석 결과를 불러오지 못했습니다.", { id: toastId });
    } finally {
      if (canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) setPanelRetrying(null);
    }
  };

  const retryClinicalResults = async () => {
    const requestCaseId = caseId;
    const toastId = `case-clinical-retry-${requestCaseId}`;
    setPanelRetrying("CLINICAL");
    setClinicalResultError("");
    showToast.info("확정 결과를 다시 불러오고 있습니다.", { id: toastId });

    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${requestCaseId}/clinical-results/`);
      if (!response.ok) throw new Error(getClinicalResultHttpError(response.status));

      const data: TnmClinicalResult[] = await response.json();
      if (canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) setTnmClinicalResults(data);
      showToast.success("확정 결과를 다시 불러왔습니다.", { id: toastId });
    } catch (retryError) {
      if (!canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) return;
      console.error(retryError);
      setClinicalResultError(
        retryError instanceof TypeError
          ? getClinicalResultNetworkError()
          : retryError instanceof Error
            ? retryError.message
            : getClinicalResultNetworkError(),
      );
      showToast.error("확정 결과를 불러오지 못했습니다.", { id: toastId });
    } finally {
      if (canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) setPanelRetrying(null);
    }
  };

  const applyWorkflowDecisionServerState = useCallback((completion: WorkflowDecisionCompletion) => {
    if (!completion.currentStage && !completion.caseStatus) return;
    const applyServerState = (item: CaseItem): CaseItem => ({
      ...item,
      ...(completion.currentStage ? { current_stage: completion.currentStage } : {}),
      ...(completion.caseStatus ? { case_status: completion.caseStatus } : {}),
    });
    setSelectedCase((current) => current ? applyServerState(current) : current);
    setCases((current) => current.map((item) => item.id === caseId ? applyServerState(item) : item));
  }, [caseId]);

  const handleWorkflowDecisionCompleted = useCallback((completion: WorkflowDecisionCompletion) => {
    if (completion.closed) {
      router.push("/respiratory/cases");
      return;
    }
    applyWorkflowDecisionServerState(completion);
    setCaseRefreshVersion((current) => current + 1);
    setStageOrderNotice(completion.message);
  }, [applyWorkflowDecisionServerState, router]);

  const refreshAdvancedCase = async (completion: WorkflowDecisionCompletion) => {
    if (completion.closed) {
      router.push("/respiratory/cases");
      return;
    }
    applyWorkflowDecisionServerState(completion);
    setStageOrderNotice(completion.message);
    await refreshCaseResults();
  };

  const handleMainMenuClick = (menu: MainMenu) => {
    setSelectedMainMenu(menu);
    setExpandedMainMenu((current) =>
      current === menu ? null : menu
    );
  };

  const handleInfoMenuSelect = (menu: CaseInfoKey) => {
    const workspaceMenu = menu === "PRESCRIPTION" ? "TREATMENT" : menu;
    const access = getCaseInfoAccessState({
      key: workspaceMenu,
      currentStage: selectedCase?.current_stage,
      caseStatus: selectedCase?.case_status,
      clinicalResults: tnmClinicalResults,
      orders: caseOrders,
      aiResults: tnmAnalysisResults,
    });
    if (access.state === "LOCKED") return;
    setSelectedInfoMenu(workspaceMenu);
    const navigation = getCaseMenuNavigation(workspaceMenu);
    if (navigation.mainMenu) setSelectedMainMenu(navigation.mainMenu);
    if (navigation.resultMenu) selectResultMenu(navigation.resultMenu);
    if (navigation.aiMenu) setSelectedAiMenu(navigation.aiMenu);
  };

  const currentCaseStage = selectedCase?.current_stage;
  const previousCaseIdRef = useRef(caseId);
  const previousCaseStageRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!currentCaseStage) return;

    const stage = currentCaseStage as CaseInfoKey;
    if (!CASE_WORKFLOW_STAGES.includes(stage)) return;

    const caseChanged = previousCaseIdRef.current !== caseId;
    const previousStage = previousCaseStageRef.current;

    previousCaseIdRef.current = caseId;
    previousCaseStageRef.current = currentCaseStage;

    // Case를 처음 열거나 다른 Case로 이동하면 항상 '전체 요약'에서 시작한다.
    if (caseChanged || previousStage === undefined) {
      setSelectedInfoMenu("OVERVIEW");
      return;
    }

    const selectedAccess = getCaseInfoAccessState({
      key: selectedInfoMenu,
      currentStage: currentCaseStage,
      caseStatus: selectedCase?.case_status,
      clinicalResults: tnmClinicalResults,
      orders: caseOrders,
      aiResults: tnmAnalysisResults,
    });
    if (selectedAccess.state === "LOCKED") {
      setSelectedInfoMenu(stage);
      const navigation = getCaseMenuNavigation(stage);
      if (navigation.mainMenu) setSelectedMainMenu(navigation.mainMenu);
      if (navigation.resultMenu) selectResultMenu(navigation.resultMenu);
      if (navigation.aiMenu) setSelectedAiMenu(navigation.aiMenu);
      if (stage === "TREATMENT") setSelectedTreatmentMenu("FINAL_PLAN");
      return;
    }

    // Workflow 전환은 접근 가능 범위만 갱신한다. 사용자가 보고 있던 단계가
    // 새 current_stage의 과거 단계라면 읽기 전용 화면으로 그대로 유지한다.
    // 미래 workspace가 선택된 비정상 상태만 위의 LOCKED 분기에서 복구한다.
  }, [caseId, caseOrders, currentCaseStage, selectedCase?.case_status, selectedInfoMenu, selectResultMenu, tnmAnalysisResults, tnmClinicalResults]);

  const latestPdl1Result =
    pdl1Results.length > 0
        ? pdl1Results[0]
        : null;

  const tnmAnalysisResult = selectPreferredAiResult(
    tnmAnalysisResults,
    "PET_CT_TNM_ANALYSIS",
  ) as TnmAnalysisResult | undefined;

  const ctAnalysisResult = selectPreferredAiResult(
    tnmAnalysisResults,
    "CT_ANALYSIS",
  ) as TnmAnalysisResult | undefined;

  const tnmAnalysis = tnmAnalysisResult?.result_detail
    ? formatAiTnm({ ...tnmAnalysisResult.result_detail.tnm, result_payload: (tnmAnalysisResult.result_detail as { result_payload?: { t?: Record<string, unknown>; n?: Record<string, unknown>; m?: Record<string, unknown> } }).result_payload, ai_result_id: tnmAnalysisResult.ai_result_id })
    : undefined;

  const tnmClinicalResult = tnmClinicalResults.find(
    (result) => result.workflow_stage === "PET_CT_TNM"
  );
  const currentStageClinicalResult = tnmClinicalResults.find((result) => result.workflow_stage === selectedCase?.current_stage && result.result_status === "CONFIRMED")
    ?? (selectedCase?.current_stage === "PRESCRIPTION"
      ? tnmClinicalResults.find((result) => result.workflow_stage === "TREATMENT" && result.result_status === "CONFIRMED")
      : undefined);
  const hasFinalPrescription = casePrescriptions.some(
    (prescription) => prescription.prescription_status === "FINAL",
  );
  const confirmedPathologyResult = tnmClinicalResults.find(
    (result) => result.workflow_stage === "PATHOLOGY_GENE" && result.result_status === "CONFIRMED",
  );
  const confirmedPdl1Result = tnmClinicalResults.find(
    (result) => result.workflow_stage === "PDL1" && result.result_status === "CONFIRMED",
  );
  const submittedPathologyResult = tnmClinicalResults.find(
    (result) => result.workflow_stage === selectedCase?.current_stage
      && ["PATHOLOGY_GENE", "PDL1"].includes(result.workflow_stage)
      && result.result_status === "DRAFT",
  );
  const activePdl1Order = caseOrders.find(
    (order) => order.order_type === "PDL1" && ["ORDERED", "SCHEDULED"].includes(order.status),
  );
  const cancelledPdl1Order = caseOrders.some(
    (order) => order.order_type === "PDL1" && order.status === "CANCELLED",
  );
  const completedPdl1Order = caseOrders.some(
    (order) => order.order_type === "PDL1" && order.status === "COMPLETED",
  );
  const hasPdl1Result = tnmClinicalResults.some(
    (result) => result.workflow_stage === "PDL1",
  );
  const pathologyResultForPdl1 = confirmedPathologyResult;
  const canAdvancePathologyToPdl1 = selectedCase?.current_stage === "PATHOLOGY_GENE"
    && pathologyResultForPdl1?.result_status === "CONFIRMED"
    && !confirmedPdl1Result;
  const canReorderCancelledPdl1 = selectedCase?.current_stage === "PDL1"
    && !activePdl1Order
    && cancelledPdl1Order
    && !completedPdl1Order
    && !hasPdl1Result;
  const selectedInfoAccess = getCaseInfoAccessState({
    key: selectedInfoMenu,
    currentStage: selectedCase?.current_stage,
    caseStatus: selectedCase?.case_status,
    clinicalResults: tnmClinicalResults,
    orders: caseOrders,
    aiResults: tnmAnalysisResults,
  });
  const isPdl1PreviewWaiting = selectedInfoMenu === "PDL1"
    && selectedCase?.current_stage === "PATHOLOGY_GENE"
    && selectedInfoAccess.state === "WAITING";
  const showWorkspaceWaitingBanner = selectedInfoAccess.state === "WAITING"
    && !(selectedInfoMenu === "TREATMENT" && selectedTreatmentMenu === "FINAL_PLAN")
    && !(selectedInfoMenu === "PRESCRIPTION" && selectedPrescriptionMenu === "PRESCRIPTION_LIST");
  const prescriptionActionable = selectedCase?.case_status === "ACTIVE"
    && selectedCase.current_stage === "PRESCRIPTION";
  const treatmentRequiresPrescription = caseTreatmentDecision?.requires_prescription ?? true;
  const treatmentDecisionActionable = selectedCase?.case_status === "ACTIVE"
    && selectedCase.current_stage === "TREATMENT";
  const isTreatmentPrescriptionPending = selectedInfoMenu === "TREATMENT"
    && !treatmentDecisionActionable
    && !prescriptionActionable;
  const requiresPdl1StageDecision = selectedCase?.current_stage === "PDL1"
    && Boolean(confirmedPdl1Result);
  const isFixedWorkspace = ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "AI_SUMMARY", "PRESCRIPTION", "TREATMENT"].includes(selectedInfoMenu);

  const tnmClinical =
    tnmClinicalResult?.result_detail?.tnm;

  const geneClinicalResult = tnmClinicalResults.find(
    (result) => result.workflow_stage === "PATHOLOGY_GENE"
  ) as GeneClinicalResult | undefined;

  const pdl1ClinicalResult = tnmClinicalResults.find(
    (result) => result.workflow_stage === "PDL1",
  ) as unknown as Pdl1ClinicalResult | undefined;
  const resolvedPdl1ClinicalResult = pdl1ClinicalResult;

  const geneAiResult = selectPreferredAiResult(
    tnmAnalysisResults,
    "PATHOLOGY_GENE_ANALYSIS",
  ) as TnmAnalysisResult | undefined;

  const pathologyClinicalResult = geneClinicalResult;

  const pathologyAiResult = selectPreferredAiResult(
    tnmAnalysisResults,
    "PATHOLOGY_GENE_ANALYSIS",
  ) as TnmAnalysisResult | undefined;

  const treatmentAnalysisResult = selectPreferredAiResult(
    tnmAnalysisResults,
    "TREATMENT_RECOMMENDATION",
  ) as TreatmentAnalysisResult | undefined;

  const treatmentAnalysis =
    treatmentAnalysisResult?.result_detail?.treatment;

  const selectedClinicalResult = tnmClinicalResults.find(
    (result) => result.workflow_stage === selectedResultMenu,
  );
  const ctClinicalResult = tnmClinicalResults.find(
    (result) => result.workflow_stage === "CT",
  );


  const selectedAiType = {
    XRAY: "XRAY_ANALYSIS",
    CT: "CT_ANALYSIS",
    PATHOLOGY_GENE: "PATHOLOGY_GENE_ANALYSIS",
    PET_CT_TNM: "PET_CT_TNM_ANALYSIS",
    PDL1: "PDL1_ANALYSIS",
  }[selectedResultMenu];

  const selectedAiResult = selectPreferredAiResult(
    tnmAnalysisResults,
    selectedAiType,
  ) as TnmAnalysisResult | undefined;

  const confirmSubmittedPathologyResult = async () => {
    if (!submittedPathologyResult?.id || confirmingPathologyResult) return;
    const toastId = `case-pathology-confirm-${caseId}-${submittedPathologyResult.id}`;
    setConfirmingPathologyResult(true);
    try {
      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/clinical-results/pathology/${submittedPathologyResult.id}/confirm/`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.detail === "string" ? body.detail : "결과 확정에 실패했습니다.");
      }
      showToast.success(
        submittedPathologyResult.workflow_stage === "PDL1"
          ? "PD-L1 결과가 확정되었습니다."
          : "병리 결과가 확정되었습니다.",
        { id: toastId },
      );
      await refreshCaseResults();
    } catch (error) {
      console.error(error);
      showToast.error("결과 확정에 실패했습니다.", { id: toastId });
    } finally {
      setConfirmingPathologyResult(false);
    }
  };

  const handleCaseTreatmentDraftSave = async () => {
    if (!caseId) return;

    try {
      setCaseTreatmentSaving(true);
      setCaseTreatmentError("");
      setCaseTreatmentMessage("");

      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/treatment-decision/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            treatment_type: caseTreatmentForm.treatment_type || null,
            selected_regimen:
              caseTreatmentForm.selected_regimen || null,
            treatment_plan: caseTreatmentForm.treatment_plan || null,
            targeted_therapy_plan:
              caseTreatmentForm.targeted_therapy_plan || null,
            rationale: caseTreatmentForm.rationale || null,
          }),
        }
      );

      const data: CaseTreatmentDecision & { detail?: string } =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "치료 결정 저장 중 오류가 발생했습니다."
        );
      }

      setCaseTreatmentDecision(data);
      setCaseTreatmentForm({
        treatment_type: data.treatment_type ?? "",
        selected_regimen: data.selected_regimen ?? "",
        treatment_plan: data.treatment_plan ?? "",
        targeted_therapy_plan: data.targeted_therapy_plan ?? "",
        rationale: data.rationale ?? "",
      });
      setCaseTreatmentMessage("치료 결정 DRAFT가 저장되었습니다.");
    } catch (err) {
      setCaseTreatmentError(
        err instanceof Error
          ? err.message
          : "치료 결정 저장 중 오류가 발생했습니다."
      );
    } finally {
      setCaseTreatmentSaving(false);
    }
  };

  const handleCaseTreatmentConfirm = async () => {
    if (!caseId || !caseTreatmentDecision) return;

    const shouldConfirm = window.confirm(
      "치료계획을 최종 확정하면 수정할 수 없습니다.\n계속하시겠습니까?"
    );

    if (!shouldConfirm) return;

    try {
      setCaseTreatmentConfirming(true);
      setCaseTreatmentError("");
      setCaseTreatmentMessage("");

      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/treatment-decision/confirm/`,
        {
          method: "POST",
        }
      );

      const data: CaseTreatmentDecision & { detail?: string } =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "치료 결정 확정 중 오류가 발생했습니다."
        );
      }

      setCaseTreatmentDecision(data);
      setCaseTreatmentConfirmed(true);
      setCaseTreatmentMessage("치료 결정이 최종 확정되었습니다.");
    } catch (err) {
      setCaseTreatmentError(
        err instanceof Error
          ? err.message
          : "치료 결정 확정 중 오류가 발생했습니다."
      );
    } finally {
      setCaseTreatmentConfirming(false);
    }
  };

  const handleCasePrescriptionCreate = async () => {
    if (!caseId || selectedCase?.case_status !== "ACTIVE" || selectedCase.current_stage !== "PRESCRIPTION" || casePrescriptionWorking) return;

    const toastId = `case-prescription-create-${caseId}`;
    try {
      setCasePrescriptionWorking(true);
      setCasePrescriptionError("");
      setCasePrescriptionMessage("");
      showToast.info("처방을 저장하고 있습니다.", { id: toastId });

      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cycle_number: Number(casePrescriptionCycleNumber),
            phase: casePrescriptionPhase,
            cycle_start_date: casePrescriptionCycleStartDate || null,
          }),
        }
      );

      const data: CasePrescription & { detail?: string } =
        await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "처방 생성에 실패했습니다.");
      }

      const prescriptionResponse = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/`);

      if (!prescriptionResponse.ok) {
        throw new Error("처방 목록을 불러오지 못했습니다.");
      }

      const prescriptionData: CasePrescription[] =
        await prescriptionResponse.json();

      setCasePrescriptions(prescriptionData);
      setCasePrescriptionCycleNumber("1");
      setCasePrescriptionPhase("INDUCTION");
      setCasePrescriptionCycleStartDate("");
      setCasePrescriptionMessage("처방 DRAFT가 생성되었습니다.");
      showToast.success("처방이 저장되었습니다.", { id: toastId });
    } catch (err) {
      console.error(err);
      setCasePrescriptionError("처방 저장에 실패했습니다.");
      showToast.error("처방 저장에 실패했습니다.", { id: toastId });
    } finally {
      setCasePrescriptionWorking(false);
    }
  };

  const handleCasePrescriptionItemUpdate = async (
    prescriptionId: string,
    itemId: string,
    finalDose: string,
    instructions: string
  ) => {
    if (!caseId || selectedCase?.case_status !== "ACTIVE" || selectedCase.current_stage !== "PRESCRIPTION" || casePrescriptionWorking) return;

    const toastId = `case-prescription-item-${caseId}-${itemId}`;
    try {
      setCasePrescriptionWorking(true);
      setCasePrescriptionError("");
      setCasePrescriptionMessage("");
      showToast.info("처방을 저장하고 있습니다.", { id: toastId });

      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/items/${itemId}/`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            final_dose: finalDose,
            instructions,
          }),
        }
      );

      const data: CasePrescriptionItem & { detail?: string } =
        await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "처방 약물 수정에 실패했습니다.");
      }

      const prescriptionResponse = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/`);

      if (!prescriptionResponse.ok) {
        throw new Error("처방 목록을 불러오지 못했습니다.");
      }

      const prescriptionData: CasePrescription[] =
        await prescriptionResponse.json();

      setCasePrescriptions(prescriptionData);
      setCasePrescriptionMessage("처방 약물 정보가 수정되었습니다.");
      showToast.success("처방이 저장되었습니다.", { id: toastId });
    } catch (err) {
      console.error(err);
      setCasePrescriptionError("처방 저장에 실패했습니다.");
      showToast.error("처방 저장에 실패했습니다.", { id: toastId });
    } finally {
      setCasePrescriptionWorking(false);
    }
  };

  const handleCasePrescriptionSafetyCheck = async (
    prescriptionId: string
  ) => {
    if (!caseId || selectedCase?.case_status !== "ACTIVE" || selectedCase.current_stage !== "PRESCRIPTION" || casePrescriptionWorking) return;

    try {
      setCasePrescriptionWorking(true);
      setCasePrescriptionError("");
      setCasePrescriptionMessage("");

      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/safety-check/`,
        {
          method: "POST",
        }
      );

      const data: { detail?: string } = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "안전성 검사에 실패했습니다.");
      }

      const prescriptionResponse = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/`);

      if (!prescriptionResponse.ok) {
        throw new Error("처방 목록을 불러오지 못했습니다.");
      }

      const prescriptionData: CasePrescription[] =
        await prescriptionResponse.json();

      setCasePrescriptions(prescriptionData);
      setCasePrescriptionMessage("안전성 검사가 완료되었습니다.");
    } catch (err) {
      setCasePrescriptionError(
        err instanceof Error ? err.message : "안전성 검사에 실패했습니다."
      );
    } finally {
      setCasePrescriptionWorking(false);
    }
  };

  const handleCasePrescriptionAcknowledgeWarnings = async (
    prescriptionId: string
  ) => {
    if (!caseId || selectedCase?.case_status !== "ACTIVE" || selectedCase.current_stage !== "PRESCRIPTION" || casePrescriptionWorking) return;

    const note = window.prompt(
      "WARNING 확인 사유를 입력하세요.",
      "담당의 검토 후 처방 진행"
    );

    if (note === null) return;

    try {
      setCasePrescriptionWorking(true);
      setCasePrescriptionError("");
      setCasePrescriptionMessage("");

      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/warnings/acknowledge/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            acknowledgment_note: note,
          }),
        }
      );

      const data: { detail?: string } = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "WARNING 확인 처리에 실패했습니다.");
      }

      const prescriptionResponse = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/`);

      if (!prescriptionResponse.ok) {
        throw new Error("처방 목록을 불러오지 못했습니다.");
      }

      const prescriptionData: CasePrescription[] =
        await prescriptionResponse.json();

      setCasePrescriptions(prescriptionData);
      setCasePrescriptionMessage("WARNING 확인이 완료되었습니다.");
    } catch (err) {
      setCasePrescriptionError(
        err instanceof Error
          ? err.message
          : "WARNING 확인 처리에 실패했습니다."
      );
    } finally {
      setCasePrescriptionWorking(false);
    }
  };

  const handleCasePrescriptionFinalize = async (
    prescriptionId: string,
    medicationSchedules: FinalizeMedicationSchedule[] = []
  ) => {
    if (!caseId || selectedCase?.case_status !== "ACTIVE" || selectedCase.current_stage !== "PRESCRIPTION" || casePrescriptionWorking) return;

    const confirmed = window.confirm(
      "처방을 최종 확정하면 이후 수정할 수 없습니다.\n계속하시겠습니까?"
    );

    if (!confirmed) return;

    const toastId = `case-prescription-finalize-${caseId}-${prescriptionId}`;
    try {
      setCasePrescriptionWorking(true);
      setCasePrescriptionError("");
      setCasePrescriptionMessage("");
      showToast.info("처방을 확정하고 있습니다.", { id: toastId });

      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/finalize/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ medication_schedules: medicationSchedules }),
        }
      );

      const data: { detail?: string } = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "처방 최종 확정에 실패했습니다.");
      }

      const prescriptionResponse = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/`);

      if (!prescriptionResponse.ok) {
        throw new Error("처방 목록을 불러오지 못했습니다.");
      }

      const prescriptionData: CasePrescription[] =
        await prescriptionResponse.json();

      setCasePrescriptions(prescriptionData);
      setCasePrescriptionMessage("처방이 최종 확정되었습니다.");
      showToast.success("처방이 확정되었습니다.", { id: toastId });
    } catch (err) {
      console.error(err);
      setCasePrescriptionError("처방 최종 확정에 실패했습니다.");
      showToast.error("처방 확정에 실패했습니다.", { id: toastId });
    } finally {
      setCasePrescriptionWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
        담당 환자 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (error || !selectedCase) {
    return <CaseWorkspaceEmpty errorMessage={error} />;
  }

  return (
    <>
      <div className={`${workspaceStyles.workspace} h-full min-h-0 overflow-hidden bg-[#f3f7fd]`} aria-label="Case Workspace">
      <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(220px,236px)_108px_minmax(0,1fr)] bg-[#f3f7fd] xl:grid-cols-[minmax(228px,244px)_116px_minmax(0,1fr)]">
      <div className="fixed bottom-3 right-16 z-40"><CaseConsultationRequest caseId={caseId} /></div>
      <CaseChatPanel key={`${caseId}-${searchParams.get("openChat") === "1"}-${searchParams.get("chatMessage") || ""}`} caseId={caseId} authorizedFetch={authorizedFetch} initiallyOpen={searchParams.get("openChat") === "1"} focusMessageId={searchParams.get("chatMessage")} />
      <CasePatientSidebar cases={filteredCases} selectedId={caseId} searchText={searchText} onSearchChange={setSearchText} onSelect={handleCaseSelect} />
      <CaseInfoMenu selected={selectedInfoMenu} currentStage={selectedCase?.current_stage} caseStatus={selectedCase?.case_status} clinicalResults={tnmClinicalResults} orders={caseOrders} aiResults={tnmAnalysisResults} onSelect={handleInfoMenuSelect} />
      <div className="flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden p-2">
      <CaseSummaryHeader
        key={caseId}
        caseData={selectedCase}
        doctorDisplayName={user?.name}
      />
      <CaseWorkflowBar
        currentStage={selectedCase.current_stage}
        hasPdl1Result={Boolean(confirmedPdl1Result)}
      />

      {/* A. 담당 환자 목록 */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
              A
            </span>

            <h2 className="font-bold text-slate-800">
              담당 환자 목록
            </h2>
          </div>

          <input
            type="text"
            value={searchText}
            onChange={(event) =>
              setSearchText(event.target.value)
            }
            placeholder="환자명 / 환자번호"
            className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {filteredCases.map((item) => {
              const active = item.id === caseId;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    handleCaseSelect(item.id)
                  }
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-transparent bg-white hover:border-emerald-100 hover:bg-emerald-50/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {item.patient_name}

                        <span className="ml-2 text-xs font-medium text-slate-500">
                          {item.patient_code}
                        </span>
                      </p>

                      <p className="mt-2 truncate text-[11px] text-slate-400">
                        {formatBirthDate(
                          item.patient_birth_date
                        )}

                        <span className="mx-2 text-slate-300">
                          |
                        </span>

                        현재단계:{" "}
                        {getStageLabel(
                          item.current_stage
                        )}
                      </p>
                    </div>

                    {active && (
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" />
                    )}
                  </div>
                </button>
              );
            })}

            {filteredCases.length === 0 && (
              <p className="py-10 text-center text-xs text-slate-400">
                검색 결과가 없습니다.
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 p-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="mb-3 text-xs font-bold text-slate-700">
              환자 기본 정보
            </p>

            <div className="space-y-2.5">
              <PatientInfoRow
                label="환자명"
                value={selectedCase.patient_name}
              />

              <PatientInfoRow
                label="환자번호"
                value={selectedCase.patient_code}
              />

              <PatientInfoRow
                label="생년월일"
                value={formatBirthDate(
                  selectedCase.patient_birth_date
                )}
              />

              <PatientInfoRow
                label="성별"
                value={getSexLabel(
                  selectedCase.patient_sex
                )}
              />

              <PatientInfoRow
                label="현재 단계"
                value={getStageLabel(
                  selectedCase.current_stage
                )}
              />

              <PatientInfoRow
                label="담당의"
                value={
                  selectedCase.primary_doctor_name ||
                  "-"
                }
              />
            </div>
          </div>
        </div>
      </aside>

      {/* 기존 계층형 메뉴는 기능 호환을 위해 보존하고 화면에서는 숨깁니다. */}
      <aside
        style={{ width: "155px" }}
        className="hidden shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-3 py-5"
      >
        <h2 className="mb-4 px-2 text-sm font-bold text-slate-900">정보</h2>
        <div className="mb-4 hidden items-center gap-2 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
            B
          </span>

          <h2 className="text-sm font-bold text-slate-700">
            업무 대분류
          </h2>
        </div>

        <div className="space-y-2">
          {workspaceMainMenus.map((menu) => {
            const active =
              selectedMainMenu === menu.key;
            const expanded =
              expandedMainMenu === menu.key;

            return (
              <div key={menu.key}>
                <button
                  type="button"
                  aria-label={getMainMenuLabel(menu.key)}
                  aria-expanded={expanded}
                  onClick={() =>
                    handleMainMenuClick(menu.key)
                  }
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition ${
                    active
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-600 hover:bg-emerald-50/60"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{menu.label}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {menu.description}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`ml-2 text-xs text-emerald-500 transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  >
                    ▼
                  </span>
                </button>

                {expanded && menu.key === "RESULTS" && (
                  <SubMenuList
                    menus={workspaceResultSubMenus}
                    selected={selectedResultMenu}
                    onSelect={selectResultMenu}
                  />
                )}
                {expanded && menu.key === "AI" && (
                  <SubMenuList
                    menus={workspaceAiSubMenus}
                    selected={selectedAiMenu}
                    onSelect={setSelectedAiMenu}
                  />
                )}
                {expanded && menu.key === "TREATMENT" && (
                  <SubMenuList
                    menus={workspaceTreatmentSubMenus}
                    selected={selectedTreatmentMenu}
                    onSelect={setSelectedTreatmentMenu}
                  />
                )}
                {expanded && menu.key === "PRESCRIPTION" && (
                  <SubMenuList
                    menus={workspacePrescriptionSubMenus}
                    selected={selectedPrescriptionMenu}
                    onSelect={setSelectedPrescriptionMenu}
                  />
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        {selectedMainMenu === "TREATMENT" && selectedTreatmentMenu === "REGIMEN" && regimenLoadError && <PanelRetryError message={regimenLoadError} retrying={panelRetrying === "REGIMEN"} onRetry={() => retryPanel("REGIMEN")} />}
        {selectedMainMenu === "TREATMENT" && selectedTreatmentMenu === "FINAL_PLAN" && treatmentLoadError && <PanelRetryError message={treatmentLoadError} retrying={panelRetrying === "TREATMENT"} onRetry={() => retryPanel("TREATMENT")} />}
        {selectedMainMenu === "PRESCRIPTION" && prescriptionLoadError && <PanelRetryError message={prescriptionLoadError} retrying={panelRetrying === "PRESCRIPTION"} onRetry={() => retryPanel("PRESCRIPTION")} />}
        <div className="mb-2 flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-1 pb-1">
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-6 w-1 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">열람 중</p>
              <h1 className="truncate text-sm font-bold text-slate-900">
              {selectedInfoMenu === "OVERVIEW"
                ? "전체 요약"
                : selectedInfoMenu === "AI_SUMMARY"
                  ? "AI 종합 분석"
                  : selectedInfoMenu === "TREATMENT"
                    ? "치료계획·처방"
                  : getDetailTitle(
                      selectedMainMenu,
                      selectedResultMenu,
                      selectedAiMenu,
                      selectedTreatmentMenu,
                      selectedPrescriptionMenu
                    )}
              </h1>
            </div>
            <span className="hidden shrink-0 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[9px] font-semibold text-blue-700 lg:inline">현재 Case 단계 · {getStageLabel(selectedCase.current_stage)}</span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {stageOrderNotice && <span role="status" className="hidden rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 lg:inline">{stageOrderNotice}</span>}
            {selectedCase?.case_status === "ACTIVE" && selectedInfoMenu === "PDL1" && selectedInfoMenu === selectedCase.current_stage && submittedPathologyResult?.workflow_stage === "PDL1" && (
              <button
                type="button"
                disabled={confirmingPathologyResult}
                onClick={() => { void confirmSubmittedPathologyResult(); }}
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {confirmingPathologyResult ? "확정 중" : "결과 확인 및 확정"}
              </button>
            )}
            {selectedCase?.case_status === "ACTIVE" && canAdvancePathologyToPdl1 && selectedInfoMenu === "PATHOLOGY_GENE" && (
              <CaseWorkflowDecision caseId={caseId} currentStage="PATHOLOGY_GENE" directProceed triggerLabel="PD-L1 검사 오더" confirmedResultId={pathologyResultForPdl1?.id} authorizedFetch={authorizedFetch} onCompleted={handleWorkflowDecisionCompleted} />
            )}
            {selectedCase?.case_status === "ACTIVE" && canReorderCancelledPdl1 && selectedInfoMenu === "PDL1" && (
              <StageExaminationOrder caseId={caseId} orderType="PDL1" followUpPathologyOrder triggerLabel="PD-L1 재오더" onCreated={() => { void refreshCaseResults(); }} />
            )}
            {selectedCase?.case_status === "ACTIVE" && selectedCase.current_stage === "XRAY" && selectedInfoMenu === "XRAY" && (
              <XrayWorkflowDecision key={caseId} caseId={caseId} authorizedFetch={authorizedFetch} onCompleted={({ closed }) => { if (closed) { router.push("/respiratory/cases"); return; } setCaseRefreshVersion((current) => current + 1); }} />
            )}
            {selectedCase?.case_status === "ACTIVE" && selectedCase.current_stage === "CT" && selectedInfoMenu === "CT" && (
              <CtWorkflowDecision key={caseId} caseId={caseId} aiResultId={ctAnalysisResult?.ai_result_id} aiNodules={ctAnalysisResult?.result_detail?.ct?.nodules} clinicalResult={selectedClinicalResult} authorizedFetch={authorizedFetch} onCompleted={handleWorkflowDecisionCompleted} />
            )}
            {selectedCase?.case_status === "ACTIVE" && selectedCase.current_stage === "PDL1" && Boolean(confirmedPdl1Result) && ["PDL1", "TREATMENT"].includes(selectedInfoMenu) && (
              <CaseWorkflowDecision caseId={caseId} currentStage="PDL1" triggerLabel="다음 단계 결정" confirmedResultId={confirmedPdl1Result?.id} authorizedFetch={authorizedFetch} onCompleted={handleWorkflowDecisionCompleted} />
            )}
            {selectedCase?.case_status === "ACTIVE" && selectedInfoMenu === selectedCase.current_stage && !["XRAY", "CT", "PATHOLOGY_GENE", "PDL1"].includes(selectedCase.current_stage) && (
              <CaseWorkflowDecision caseId={caseId} currentStage={selectedCase.current_stage} secondary={selectedCase.current_stage === "TREATMENT" || selectedCase.current_stage === "PRESCRIPTION"} triggerLabel={selectedCase.current_stage === "TREATMENT" ? "단계 처리 메뉴" : selectedCase.current_stage === "PRESCRIPTION" && !treatmentRequiresPrescription ? "비약물 치료 종료·의뢰" : undefined} exceptionsOnly={selectedCase.current_stage === "PET_CT_TNM" || (selectedCase.current_stage === "TREATMENT" && !currentStageClinicalResult)} confirmedResultId={currentStageClinicalResult?.id} confirmedStageGroup={currentStageClinicalResult?.result_detail?.tnm?.stage_group} hasFinalPrescription={hasFinalPrescription} allowCaseCloseWithoutFinalPrescription={selectedCase.current_stage === "PRESCRIPTION" && !treatmentRequiresPrescription} authorizedFetch={authorizedFetch} onCompleted={handleWorkflowDecisionCompleted} />
            )}
          </div>
        </div>

        {showWorkspaceWaitingBanner && (
          <div role="status" className="mb-2 flex shrink-0 items-center gap-2 border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="font-bold">{isPdl1PreviewWaiting ? "현재 PD-L1 진행 대기" : "결과 대기"}</span>
            <span>{isPdl1PreviewWaiting ? "조직·유전자 결과 확인 후 진행 가능" : selectedInfoAccess.message}</span>
          </div>
        )}

        <div data-case-stage-body className={`min-h-0 min-w-0 flex-1 [scrollbar-gutter:stable] ${isFixedWorkspace ? "flex flex-col overflow-hidden" : "overflow-auto"}`}>
        {(selectedInfoMenu === "TREATMENT" || selectedInfoMenu === "PRESCRIPTION") && (
          <TreatmentPrescriptionOverview mode={selectedInfoMenu === "PRESCRIPTION" || prescriptionActionable ? "PRESCRIPTION" : "TREATMENT"} treatment={caseTreatmentDecision} prescriptions={casePrescriptions} clinicalResults={tnmClinicalResults} aiResults={tnmAnalysisResults} prescriptionActionable={prescriptionActionable} />
        )}

        {((selectedMainMenu === "RESULTS" && selectedResultMenu === "CT") || ctViewerVisitedCaseId === caseId) && (
          <div className={selectedMainMenu === "RESULTS" && selectedResultMenu === "CT" ? "contents" : "hidden"}>
            <ResultReviewPanel
              stage="CT"
              caseId={caseId}
              apiBaseUrl={API_BASE_URL}
              authorizedFetch={authorizedFetch}
              clinicalResult={ctClinicalResult}
              aiResult={ctAnalysisResult}
              clinicalError={clinicalResultError}
              aiError={aiResultError}
              clinicalRetrying={panelRetrying === "CLINICAL"}
              aiRetrying={panelRetrying === "AI"}
              onRetryClinical={retryClinicalResults}
              onRetryAi={retryAiResults}
              lastSyncedAt={lastResultSyncAt}
              syncingResults={resultsSyncing}
              onRefreshResults={() => { void refreshCaseResults(); }}
              syncNotice={resultSyncNotice}
            />
          </div>
        )}

        {selectedInfoMenu === "OVERVIEW" ? (
          <div>
            <CaseOverviewPanel caseData={selectedCase} clinicalResults={tnmClinicalResults} aiResults={tnmAnalysisResults} prescriptions={casePrescriptions} orders={caseOrders} ordersLoaded={ordersLoaded} />
          </div>
        ) : selectedInfoMenu === "AI_SUMMARY" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <KnowledgeRagPanel apiBaseUrl={API_BASE_URL} authorizedFetch={authorizedFetch} />
            <AiSummaryPanel
              key={caseId}
              currentStage={selectedCase.current_stage}
              aiResults={tnmAnalysisResults}
              clinicalResults={tnmClinicalResults}
              treatmentDecision={caseTreatmentDecision}
              prescriptions={casePrescriptions}
              error={aiResultError}
              retrying={panelRetrying === "AI"}
              onRetry={retryAiResults}
              evidenceByAnalysis={{
                XRAY_ANALYSIS: <CaseImageEvidence apiBaseUrl={API_BASE_URL} authorizedFetch={authorizedFetch} caseId={caseId} stage="XRAY" />,
                CT_ANALYSIS: <CaseCtSegmentationEvidence apiBaseUrl={API_BASE_URL} authorizedFetch={authorizedFetch} caseId={caseId} analysisId={ctAnalysisResult?.id} nodules={ctAnalysisResult?.result_detail?.ct?.nodules ?? []} />,
                PET_CT_TNM_ANALYSIS: <CaseDicomEvidence apiBaseUrl={API_BASE_URL} authorizedFetch={authorizedFetch} caseId={caseId} stage="PET_CT_TNM" />,
                PATHOLOGY_GENE_ANALYSIS: <CaseWsiEvidence apiBaseUrl={API_BASE_URL} authorizedFetch={authorizedFetch} caseId={caseId} stain="HE" fillHeight />,
                PDL1_ANALYSIS: <CaseWsiEvidence apiBaseUrl={API_BASE_URL} authorizedFetch={authorizedFetch} caseId={caseId} stain="PDL1" fillHeight />,
              }}
            />
          </div>
        ) : selectedInfoMenu === "TREATMENT" || selectedInfoMenu === "PRESCRIPTION" ? (
          isTreatmentPrescriptionPending ? (
            <TreatmentPrescriptionPendingPanel
              waitingMessage={selectedInfoAccess.message}
              requiresPdl1StageDecision={requiresPdl1StageDecision}
            />
          ) : (
          <section className="flex min-h-0 flex-1 flex-col gap-2">
            <nav aria-label="치료계획과 처방 보기" className="flex shrink-0 gap-2 text-xs">
              {(["TREATMENT", "PRESCRIPTION"] as const).map(tab => <button key={tab} type="button" onClick={() => setTreatmentView({ caseId, tab })} aria-pressed={(treatmentView?.caseId === caseId ? treatmentView.tab : prescriptionActionable ? "PRESCRIPTION" : "TREATMENT") === tab} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 aria-pressed:border-blue-300 aria-pressed:bg-blue-50 aria-pressed:text-blue-700">{tab === "TREATMENT" ? "치료계획 · 근거" : "처방 · 안전성"}</button>)}
            </nav>
            <div className={(treatmentView?.caseId === caseId ? treatmentView.tab === "PRESCRIPTION" : prescriptionActionable) ? "hidden" : "min-h-0 flex-1"}>
            <TreatmentDecisionPanel
              actionable={treatmentDecisionActionable}
              waitingMessage={selectedInfoAccess.state === "WAITING" ? selectedInfoAccess.message : undefined}
              key={caseId}
              caseId={caseId}
              apiBaseUrl={API_BASE_URL}
              authorizedFetch={authorizedFetch}
              onTreatmentChanged={(decision) => {
                setCaseTreatmentDecision(decision as CaseTreatmentDecision);
                setCaseTreatmentForm({
                  treatment_type: decision.treatment_type ?? "",
                  selected_regimen: decision.selected_regimen ?? "",
                  treatment_plan: decision.treatment_plan ?? "",
                  targeted_therapy_plan: decision.targeted_therapy_plan ?? "",
                  rationale: decision.rationale ?? "",
                });
              }}
              onTreatmentConfirmed={(decision) => {
                setTreatmentView({ caseId, tab: "TREATMENT" });
                setCaseTreatmentDecision(decision as CaseTreatmentDecision);
                applyWorkflowDecisionServerState({
                  message: "",
                  closed: false,
                  currentStage: decision.current_stage ?? undefined,
                  caseStatus: decision.case_status ?? undefined,
                });
                setCaseRefreshVersion((current) => current + 1);
              }}
            />
            </div>
            <div className={(treatmentView?.caseId === caseId ? treatmentView.tab === "PRESCRIPTION" : prescriptionActionable) ? "min-h-0 flex-1" : "hidden"}>
            <PrescriptionPanel
              caseId={caseId}
              apiBaseUrl={API_BASE_URL}
              authorizedFetch={authorizedFetch}
              refreshKey={caseRefreshVersion}
              actionable={prescriptionActionable}
              hasSelectedRegimen={Boolean(caseTreatmentDecision?.selected_regimen)}
              requiresPrescription={treatmentRequiresPrescription}
              onPrescriptionChanged={() => setCaseRefreshVersion((current) => current + 1)}
            />
            </div>
          </section>
          )
        ) : selectedMainMenu === "PRESCRIPTION" &&
        selectedPrescriptionMenu === "PRESCRIPTION_LIST" ? (
          <fieldset disabled={!prescriptionActionable} className="contents"><PrescriptionSection className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
              <div>
                <p className="text-xs font-semibold text-emerald-600">
                  처방 조회
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-800">
                  기존 처방 목록
                </h2>
              </div>

              {casePrescriptionError && (
                <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {casePrescriptionError}
                </p>
              )}

              {casePrescriptionMessage && (
                casePrescriptionMessage !== "처방이 최종 확정되었습니다." || hasFinalPrescription
              ) && (
                <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {casePrescriptionMessage}
                </p>
              )}

              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pb-20 pr-1">
                {casePrescriptions.map((prescription) => (
                  <article
                    key={prescription.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-bold text-slate-800">
                          {prescription.regimen_detail.regimen_name}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {prescription.regimen_detail.regimen_code} · 투여 주기 {prescription.cycle_number} · {prescription.phase_label}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                          prescription.prescription_status === "FINAL"
                            ? "bg-emerald-100 text-emerald-700"
                            : prescription.prescription_status === "VALIDATED"
                              ? "bg-sky-50 text-sky-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {prescription.prescription_status_label || getPrescriptionStatusLabel(prescription.prescription_status)}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-slate-400">치료 단계</p>
                        <p className="mt-1 font-semibold text-slate-600">
                          {prescription.phase_label}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-slate-400">Cycle 시작일</p>
                        <p className="mt-1 font-semibold text-slate-600">
                          {prescription.cycle_start_date || "-"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-slate-400">처방 항목</p>
                        <p className="mt-1 font-semibold text-slate-600">
                          {prescription.items.length}개
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-slate-400">안전성 검사</p>
                        <p className="mt-1 font-semibold text-slate-600">
                          {prescription.safety_check_results.length > 0
                            ? `결과 ${prescription.safety_check_results.length}건`
                            : "미실행"}
                        </p>
                      </div>
                    </div>

                    {prescription.items.length > 0 && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-slate-100 bg-white">
                        {prescription.items.map((item) => (
                          <CasePrescriptionItemRow
                            key={item.id}
                            item={item}
                            prescriptionId={prescription.id}
                            editable={
                              prescription.prescription_status === "DRAFT"
                            }
                            working={casePrescriptionWorking}
                            onSave={handleCasePrescriptionItemUpdate}
                            onDirtyChange={(dirty) => setPrescriptionItemDirty((current) => ({ ...current, [item.id]: dirty }))}
                          />
                        ))}
                      </div>
                    )}

                    {prescription.prescription_status === "FINAL" && (
                      <MedicationSchedulePanel
                        caseId={caseId}
                        prescriptionId={prescription.id}
                        items={prescription.items}
                        apiBaseUrl={API_BASE_URL}
                        authorizedFetch={authorizedFetch}
                      />
                    )}

                    {prescription.safety_check_results.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-bold text-slate-700">
                          안전성 검사 결과
                        </p>
                        {prescription.safety_check_results.map((result) => (
                          <div
                            key={result.id}
                            className={`rounded-lg border px-3 py-2 ${
                              result.result === "BLOCK"
                                ? "border-red-200 bg-red-50"
                                : result.result === "WARNING"
                                  ? "border-amber-200 bg-amber-50"
                                  : "border-emerald-100 bg-emerald-50/50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700">
                                  {result.check_type_label}
                                </p>
                                <p className="mt-1 break-words text-xs text-slate-500">
                                  {result.message}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                  result.result === "BLOCK"
                                    ? "bg-red-100 text-red-700"
                                    : result.result === "WARNING"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                {result.result_label || result.result}
                              </span>
                            </div>
                            {result.result === "WARNING" &&
                              result.acknowledged_at && (
                                <p className="mt-2 text-[11px] text-amber-700">
                                  의료진 확인 완료
                                  {result.acknowledgment_note
                                    ? ` · ${result.acknowledgment_note}`
                                    : ""}
                                </p>
                              )}
                          </div>
                        ))}
                      </div>
                    )}

                    {prescription.prescription_status === "DRAFT" && (
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={casePrescriptionWorking}
                          onClick={() =>
                            handleCasePrescriptionSafetyCheck(prescription.id)
                          }
                          className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {casePrescriptionWorking
                            ? "실행 중..."
                            : "안전성 검사 실행"}
                        </button>
                      </div>
                    )}

                    {prescription.prescription_status === "VALIDATED" &&
                      prescription.safety_check_results.some(
                        (result) =>
                          result.result === "WARNING" &&
                          !result.acknowledged_at
                      ) && (
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            disabled={casePrescriptionWorking}
                            onClick={() =>
                              handleCasePrescriptionAcknowledgeWarnings(
                                prescription.id
                              )
                            }
                            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                          >
                            WARNING 확인
                          </button>
                        </div>
                      )}

                    {prescription.safety_check_results.some(
                      (result) => result.result === "BLOCK"
                    ) && (
                      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                        BLOCK 결과가 있어 처방을 최종 확정할 수 없습니다.
                      </p>
                    )}

                    {prescription.prescription_status === "VALIDATED" && !prescription.safety_check_results.some((result) => result.result === "BLOCK" || (result.result === "WARNING" && !result.acknowledged_at)) && (
                      <div className="mt-3">
                        <PrescriptionFinalizeScheduleForm items={prescription.items} working={casePrescriptionWorking} onFinalize={async (schedules) => handleCasePrescriptionFinalize(prescription.id, schedules)} />
                      </div>
                    )}



                    <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                      생성 {prescription.created_at} · 수정 {prescription.updated_at}
                    </p>
                  </article>
                ))}

                {casePrescriptions.length === 0 && (
                  <div className="rounded-xl bg-slate-50 px-5 py-10 text-center text-sm text-slate-400">
                    등록된 처방이 없습니다.
                  </div>
                )}
              </div>
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
              <WorkflowStatusFlow
                stage="PRESCRIPTION"
                prescriptionStatus={hasFinalPrescription ? "FINAL" : casePrescriptions.find((prescription) => prescription.prescription_status !== "CANCELLED")?.prescription_status}
                caseStatus={selectedCase?.case_status}
              />
              <p className="text-xs font-semibold text-sky-600">
                확정 치료결정 기반
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-800">
                새 처방 생성
              </h2>

              {!prescriptionActionable ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-semibold">현재 처방 생성 대기</p>
                  <p className="mt-1 text-xs leading-5">치료계획 최종 확정 후 처방 작성 가능</p>
                </div>
              ) : <div className="min-h-0 flex-1 overflow-y-auto pb-20 pr-1">
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    Cycle 번호
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={casePrescriptionCycleNumber}
                    onChange={(event) =>
                      setCasePrescriptionCycleNumber(event.target.value)
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-300"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    치료 단계
                  </span>
                  <select
                    value={casePrescriptionPhase}
                    onChange={(event) =>
                      setCasePrescriptionPhase(event.target.value)
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
                  >
                    <option value="INDUCTION">INDUCTION</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="CONTINUOUS">지속치료</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    Cycle 시작일
                  </span>
                  <input
                    type="date"
                    value={casePrescriptionCycleStartDate}
                    onChange={(event) =>
                      setCasePrescriptionCycleStartDate(event.target.value)
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-300"
                  />
                </label>
              </div>

              <button
                type="button"
                disabled={
                  casePrescriptionWorking ||
                  !caseTreatmentDecision?.selected_regimen
                }
                onClick={handleCasePrescriptionCreate}
                className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {casePrescriptionWorking
                  ? "생성 중..."
                  : "임시 처방 생성"}
              </button>

              <p className="mt-3 text-[11px] leading-5 text-slate-400">
                생성 조건과 안전성 검사는 기존 처방 검증 기준을 따릅니다.
              </p>
              </div>}
            </section>
          </PrescriptionSection></fieldset>
        ) : selectedMainMenu === "PRESCRIPTION" && selectedPrescriptionMenu === "SAFETY_CHECK" ? (
          <fieldset disabled={selectedCase?.case_status !== "ACTIVE" || selectedCase.current_stage !== "PRESCRIPTION"} className="contents"><PatientSafetyDataPanel key={caseId} caseId={caseId} apiBaseUrl={API_BASE_URL} authorizedFetch={authorizedFetch} /></fieldset>
        ) : false ? (
          <TreatmentSection className="grid grid-cols-[minmax(280px,0.75fr)_minmax(0,1.25fr)] items-start gap-3">
            <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
              <div>
                <p className="text-xs font-semibold text-emerald-600">
                  의료진 치료 결정
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-800">
                  의료진 최종 치료계획
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  현재 Case의 치료계획을 작성하고 임시 저장합니다.
                </p>
              </div>

              {!caseTreatmentDecision && (
                <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  아직 등록된 최종 치료계획이 없습니다. 새 치료계획을 작성할 수 있습니다.
                </p>
              )}

              {caseTreatmentError && (
                <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {caseTreatmentError}
                </p>
              )}

              {caseTreatmentMessage && (
                <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {caseTreatmentMessage}
                </p>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    치료 유형
                  </span>
                  <select
                    value={caseTreatmentForm.treatment_type}
                    disabled={caseTreatmentConfirmed}
                    onChange={(event) =>
                      setCaseTreatmentForm((current) => ({
                        ...current,
                        treatment_type: event.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-300"
                  >
                    <option value="">선택</option>
                    <option value="CHEMOTHERAPY">항암화학요법</option>
                    <option value="TARGETED_THERAPY">표적치료</option>
                    <option value="IMMUNOTHERAPY">면역치료</option>
                    <option value="COMBINATION">병합치료</option>
                    <option value="RADIATION">방사선치료</option>
                    <option value="SURGERY">수술</option>
                    <option value="SUPPORTIVE_CARE">지지치료</option>
                    <option value="OBSERVATION">관찰</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    선택 치료요법
                  </span>
                  <select
                    value={caseTreatmentForm.selected_regimen}
                    disabled={caseTreatmentConfirmed}
                    onChange={(event) =>
                      setCaseTreatmentForm((current) => ({
                        ...current,
                        selected_regimen: event.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-300"
                  >
                    <option value="">선택 없음</option>
                    {regimenCandidates.map((candidate) => (
                      <option
                        key={candidate.regimen_detail.id}
                        value={candidate.regimen_detail.id}
                      >
                        {candidate.regimen_detail.regimen_name} ({candidate.regimen_detail.regimen_code})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    치료 계획
                  </span>
                  <textarea
                    value={caseTreatmentForm.treatment_plan}
                    disabled={caseTreatmentConfirmed}
                    onChange={(event) =>
                      setCaseTreatmentForm((current) => ({
                        ...current,
                        treatment_plan: event.target.value,
                      }))
                    }
                    rows={2}
                    placeholder="치료 계획을 입력하세요."
                    className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-300"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    표적치료 계획
                  </span>
                  <textarea
                    value={caseTreatmentForm.targeted_therapy_plan}
                    disabled={caseTreatmentConfirmed}
                    onChange={(event) =>
                      setCaseTreatmentForm((current) => ({
                        ...current,
                        targeted_therapy_plan: event.target.value,
                      }))
                    }
                    rows={2}
                    placeholder="표적치료 계획을 입력하세요."
                    className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-300"
                  />
                </label>
              </div>

              <label className="mt-3 block">
                <span className="text-xs font-semibold text-slate-600">
                  결정 근거
                </span>
                <textarea
                  value={caseTreatmentForm.rationale}
                  disabled={caseTreatmentConfirmed}
                  onChange={(event) =>
                    setCaseTreatmentForm((current) => ({
                      ...current,
                      rationale: event.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="치료 결정 근거를 입력하세요."
                  className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-300"
                />
              </label>

              {(caseTreatmentDecision?.ai_recommendation_action_label ||
                caseTreatmentDecision?.ai_recommendation_action) && (
                <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-50/50 px-4 py-3">
                  <span className="text-xs font-semibold text-slate-500">
                    AI 추천 반영 여부
                  </span>
                  <span className="text-sm font-semibold text-emerald-700">
                    {caseTreatmentDecision?.ai_recommendation_action_label ??
                      caseTreatmentDecision?.ai_recommendation_action}
                  </span>
                </div>
              )}

              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCaseTreatmentDraftSave}
                  disabled={
                    caseTreatmentSaving ||
                    caseTreatmentConfirming ||
                    caseTreatmentConfirmed
                  }
                  className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {caseTreatmentSaving ? "저장 중..." : "임시 저장"}
                </button>
                <button
                  type="button"
                  onClick={handleCaseTreatmentConfirm}
                  disabled={
                    !caseTreatmentDecision ||
                    caseTreatmentSaving ||
                    caseTreatmentConfirming ||
                    caseTreatmentConfirmed
                  }
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {caseTreatmentConfirming
                    ? "확정 중..."
                    : caseTreatmentConfirmed
                      ? "최종 확정 완료"
                      : "최종 확정"}
                </button>
              </div>
            </section>
          </TreatmentSection>
        ) : selectedMainMenu === "TREATMENT" &&
        selectedTreatmentMenu === "AI_RECOMMENDATION" ? (
        treatmentAnalysis ? (
          <TreatmentSection className="space-y-4">
            <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <p className="text-xs font-semibold text-emerald-600">
                  AI 분석 결과
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-800">
                  AI 치료 추천
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  의료진의 최종 치료 결정과 구분되는 참고용 AI 분석 결과입니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-emerald-50/60 px-4 py-4">
                  <p className="text-xs font-semibold text-emerald-700">
                    종합 소견
                  </p>
                  <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {treatmentAnalysis.overall_opinion || "-"}
                  </p>
                </div>
                <div className="rounded-xl bg-sky-50/60 px-4 py-4">
                  <p className="text-xs font-semibold text-sky-700">
                    추천 치료 계획
                  </p>
                  <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {treatmentAnalysis.recommended_plan || "-"}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-bold text-slate-800">
                  표적치료 추천
                </p>
                <p className="mt-3 break-words whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {treatmentAnalysis.targeted_therapy_recommendation ??
                    "표시할 표적치료 추천이 없습니다."}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-bold text-slate-800">
                  추천 근거
                </p>
                <p className="mt-3 break-words whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {treatmentAnalysis.rationale ??
                    "표시할 추천 근거가 없습니다."}
                </p>
              </div>
            </section>

            {(Boolean(treatmentAnalysis.prescription_draft) ||
              Boolean(treatmentAnalysis.evidence)) && (
              <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3 text-xs text-slate-500">
                처방 초안 또는 추가 근거 데이터가 존재하지만 구조화된 상세 정보가 제공되지 않았습니다.
              </div>
            )}
          </TreatmentSection>
        ) : (
          <div className="rounded-2xl border border-emerald-100 bg-white px-6 py-16 text-center text-sm text-slate-400 shadow-sm">
            AI 치료 추천 결과가 없습니다.
          </div>
        )
        ) : selectedMainMenu === "TREATMENT" &&
        selectedTreatmentMenu === "REGIMEN" ? (
        <TreatmentSection>
          <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-800">
                  확정된 임상 결과와 치료 규칙이 일치하는 치료요법 후보입니다.
            </p>
            <p className="mt-1 text-xs text-emerald-600">
              표시 순서는 기존 우선순위 기준을 따르며 최종 치료 결정은 의료진이 진행합니다.
            </p>
          </div>

          {regimenCandidatesLoading ? (
            <div role="status" className="rounded-2xl border border-emerald-100 bg-white px-6 py-16 text-center text-sm text-slate-400 shadow-sm">
              치료요법 후보를 불러오는 중입니다.
            </div>
          ) : regimenLoadError ? null : regimenCandidates.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {regimenCandidates.map((candidate) => (
                <section
                  key={candidate.id}
                  className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-slate-800">
                        {candidate.regimen_detail.regimen_name}
                      </h2>
                      <p className="mt-1 text-xs text-slate-400">
                        {candidate.regimen_detail.regimen_code}
                        {candidate.regimen_detail.treatment_line
                          ? ` · ${candidate.regimen_detail.treatment_line}`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
                      우선순위 {candidate.priority}
                    </span>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-500">
                      매칭 근거
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {candidate.match_reasons.map((reason) => (
                        <span
                          key={reason}
                          className="max-w-full break-words rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                        >
                          {reason}
                        </span>
                      ))}
                      {candidate.match_reasons.length === 0 && (
                        <span className="text-xs text-slate-400">
                          표시할 매칭 근거가 없습니다.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs">
                    <span className="text-slate-400">조직형</span>
                    <span className="break-words text-right font-medium text-slate-600">
                      {candidate.regimen_detail.histology ?? "-"}
                    </span>
                    <span className="text-slate-400">Cycle</span>
                    <span className="text-right font-medium text-slate-600">
                      {candidate.regimen_detail.cycle_length_days
                        ? `${candidate.regimen_detail.cycle_length_days}일`
                        : "-"}
                    </span>
                    <span className="text-slate-400">유도 치료</span>
                    <span className="text-right font-medium text-slate-600">
                      {candidate.regimen_detail.induction_cycles !== null
                        ? `${candidate.regimen_detail.induction_cycles} Cycle`
                        : "-"}
                    </span>
                    <span className="text-slate-400">유지 치료</span>
                    <span className="text-right font-medium text-slate-600">
                      {candidate.regimen_detail.maintenance_yn ? "예" : "아니오"}
                    </span>
                    <span className="text-slate-400">근거 출처</span>
                    <span className="text-right font-medium text-slate-600">
                      {candidate.regimen_detail.source ?? "-"}
                      {candidate.regimen_detail.source_version
                        ? ` · ${candidate.regimen_detail.source_version}`
                        : ""}
                    </span>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-100 bg-white px-6 py-16 text-center text-sm text-slate-400 shadow-sm">
              현재 확정된 임상 결과와 일치하는 치료요법 후보가 없습니다.
            </div>
          )}
        </TreatmentSection>
        ) : selectedMainMenu === "AI" &&
        selectedAiMenu === "PET_CT_TNM" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TnmReviewWorkspace
            actionable={selectedCase?.case_status === "ACTIVE" && selectedCase.current_stage === "PET_CT_TNM"}
            key={caseId}
            aiTnm={tnmAnalysis}
            clinicalTnm={tnmClinical}
            clinicalResultId={tnmClinicalResult?.id}
            clinicalResultStatus={tnmClinicalResult?.result_status}
            modelName={tnmAnalysisResult?.model_name}
            modelVersion={tnmAnalysisResult?.model_version_name}
            caseId={caseId}
            apiBaseUrl={API_BASE_URL}
            authorizedFetch={authorizedFetch}
            onConfirmed={retryClinicalResults}
            onStageAdvanced={refreshAdvancedCase}
            onDirtyChange={setTnmDirty}
          />
          <div className="hidden">
          <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-emerald-600">
                  AI TNM 예측 요약
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  현재 Case에 연결된 TNM AI 결과를 요약합니다.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                {tnmAnalysis?.confidence !== null &&
                tnmAnalysis?.confidence !== undefined
                  ? `전체 신뢰도 ${
                      Number(tnmAnalysis.confidence) <= 1
                        ? `${(
                            Number(tnmAnalysis.confidence) * 100
                          ).toFixed(1)}%`
                        : `${Number(tnmAnalysis.confidence)}%`
                    }`
                  : "결과 없음"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-3">
              {[
                ["T", tnmAnalysis?.predicted_t ?? "결과 없음"],
                ["N", tnmAnalysis?.predicted_n ?? "결과 없음"],
                ["M", tnmAnalysis?.predicted_m ?? "결과 없음"],
                [
                  "Stage",
                  tnmAnalysis?.predicted_stage_group ?? "결과 없음",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className={`rounded-xl border px-4 py-3 ${
                    label === "Stage"
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-slate-100 bg-slate-50/70"
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-400">
                    {label}
                  </p>
                  <p className="mt-2 text-base font-bold text-slate-500">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-4">
            <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800">
                AI 분석 결과
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                TNM AI 예측 결과를 항목별로 확인합니다.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["T", tnmAnalysis?.predicted_t ?? "-"],
                  ["N", tnmAnalysis?.predicted_n ?? "-"],
                  ["M", tnmAnalysis?.predicted_m ?? "-"],
                  ["Stage", tnmAnalysis?.predicted_stage_group ?? "-"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                  >
                    <p className="text-xs font-semibold text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-bold text-emerald-700">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50/60 px-4 py-3">
                <span className="text-xs font-semibold text-emerald-700">
                  전체 신뢰도
                </span>
                <span className="text-sm font-bold text-emerald-700">
                  {tnmAnalysis?.confidence !== null &&
                  tnmAnalysis?.confidence !== undefined
                    ? Number(tnmAnalysis.confidence) <= 1
                      ? `${(
                          Number(tnmAnalysis.confidence) * 100
                        ).toFixed(1)}%`
                      : `${Number(tnmAnalysis.confidence)}%`
                    : "-"}
                </span>
              </div>
            </section>

            <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800">
                의료진 최종 판정
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {tnmClinical
                  ? "확정된 의료진 판정 결과입니다."
                  : "확정 결과 없음"}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["T", tnmClinical?.t_category ?? ""],
                  ["N", tnmClinical?.n_category ?? ""],
                  ["M", tnmClinical?.m_category ?? ""],
                  ["최종 Stage", tnmClinical?.stage_group ?? ""],
                ].map(([label, value]) => (
                  <label key={label} className="block">
                    <span className="text-xs font-semibold text-slate-500">
                      {label}
                    </span>
                    <input
                      type="text"
                      disabled
                      value={value}
                      placeholder="확정 결과 없음"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 outline-none disabled:cursor-not-allowed"
                    />
                  </label>
                ))}
              </div>

              <label className="mt-3 block">
                <span className="text-xs font-semibold text-slate-500">
                  판독 소견
                </span>
                <textarea
                  disabled
                  rows={3}
                  value={tnmClinical?.note ?? ""}
                  placeholder="확정 판독 소견 없음"
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 outline-none disabled:cursor-not-allowed"
                />
              </label>

            </section>
          </div>

          <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3 text-xs text-slate-500">
            구조화된 PET-CT 분석 근거가 제공되지 않았습니다.
          </div>

          <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-bold text-slate-800">
                AI 결과 ↔ 의료진 결과 비교
              </h2>
              <span className="text-xs text-slate-400">
                {tnmAnalysis && tnmClinical
                  ? `AI Stage ${tnmAnalysis.predicted_stage_group ?? "-"} · 의료진 Stage ${tnmClinical.stage_group ?? "-"}`
                  : "비교 가능한 결과 없음"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ["T", tnmAnalysis?.predicted_t, tnmClinical?.t_category],
                ["N", tnmAnalysis?.predicted_n, tnmClinical?.n_category],
                ["M", tnmAnalysis?.predicted_m, tnmClinical?.m_category],
              ].map(([label, aiValue, clinicalValue]) => (
                <div
                  key={label}
                  className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                >
                  <span className="font-bold text-emerald-700">{label}</span>
                  <span className="text-xs text-slate-400">
                    AI {aiValue ?? "-"}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">→</span>
                  <span className="text-xs text-slate-400">
                    의료진 {clinicalValue ?? "-"}
                  </span>
                  <span
                    className={`ml-auto rounded-full px-2 py-1 text-[11px] font-semibold ${
                      aiValue && clinicalValue
                        ? aiValue === clinicalValue
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-600"
                        : "bg-white text-slate-500"
                    }`}
                  >
                    {aiValue && clinicalValue
                      ? aiValue === clinicalValue
                        ? "일치"
                        : "불일치"
                      : "-"}
                  </span>
                </div>
              ))}
            </div>
          </section>
          </div>
        </div>
        ) : selectedMainMenu === "AI" &&
        selectedAiMenu === "PDL1" ? (
        <Pdl1ResultPanel
          caseId={caseId}
          apiBaseUrl={API_BASE_URL}
          authorizedFetch={authorizedFetch}
          aiResult={latestPdl1Result}
          clinicalResult={resolvedPdl1ClinicalResult}
          aiError={aiResultError}
          retrying={panelRetrying === "AI"}
          onRetry={retryAiResults}
          lastSyncedAt={lastResultSyncAt}
          syncingResults={resultsSyncing}
          onRefreshResults={() => { void refreshCaseResults(); }}
          syncNotice={resultSyncNotice}
        />
        ) : selectedMainMenu === "RESULTS" && selectedResultMenu === "PATHOLOGY_GENE" ? (
        <PathologyGeneImagingWorkspace
          caseId={caseId}
          apiBaseUrl={API_BASE_URL}
          authorizedFetch={authorizedFetch}
          pathologyClinicalResult={pathologyClinicalResult}
          pathologyAiResult={pathologyAiResult}
          geneClinicalResult={geneClinicalResult}
          geneAiResult={geneAiResult}
          clinicalError={clinicalResultError}
          aiError={aiResultError}
          clinicalRetrying={panelRetrying === "CLINICAL"}
          aiRetrying={panelRetrying === "AI"}
          onRetryClinical={retryClinicalResults}
          onRetryAi={retryAiResults}
          lastSyncedAt={lastResultSyncAt}
          syncingResults={resultsSyncing}
          onRefreshResults={() => { void refreshCaseResults(); }}
          syncNotice={resultSyncNotice}
        />
        ) : selectedMainMenu === "RESULTS" ? (
        <>
          {selectedResultMenu !== "CT" && (
            <ResultReviewPanel
              stage={selectedResultMenu}
              caseId={caseId}
              apiBaseUrl={API_BASE_URL}
              authorizedFetch={authorizedFetch}
              clinicalResult={selectedClinicalResult}
              aiResult={selectedAiResult}
              clinicalError={clinicalResultError}
              aiError={aiResultError}
              clinicalRetrying={panelRetrying === "CLINICAL"}
              aiRetrying={panelRetrying === "AI"}
              onRetryClinical={retryClinicalResults}
              onRetryAi={retryAiResults}
              lastSyncedAt={lastResultSyncAt}
              syncingResults={resultsSyncing}
              onRefreshResults={() => { void refreshCaseResults(); }}
              syncNotice={resultSyncNotice}
            />
          )}
        </>
        ) : (
        <div className="rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm">
            <div className="flex min-h-[520px] items-center justify-center">
            <div className="text-center">
                <p className="text-lg font-bold text-slate-700">
                {getDetailTitle(
                    selectedMainMenu,
                    selectedResultMenu,
                    selectedAiMenu,
                    selectedTreatmentMenu,
                    selectedPrescriptionMenu
                )}
                </p>

                <p className="mt-3 text-sm text-slate-400">
                {getDetailDescription(
                    selectedMainMenu,
                    selectedTreatmentMenu,
                    selectedPrescriptionMenu
                )}
                    </p>
                </div>
                </div>
            </div>
            )}
        </div>
        </main>
      <div aria-label="Case 지원 도구 공간" className="h-10 shrink-0" />
        </div>
        {pendingCaseId && <CaseChangeDialog onCancel={() => setPendingCaseId(null)} onDiscard={discardDraftAndMove} returnFocusRef={caseTriggerRef} />}
      </div>
      </div>
    </>
    );
}

function TreatmentPrescriptionPendingPanel({ waitingMessage, requiresPdl1StageDecision }: { waitingMessage?: string; requiresPdl1StageDecision: boolean }) {
  const steps = [
    requiresPdl1StageDecision
      ? ["1", "다음 단계 결정", "확정된 PD-L1 결과를 검토한 후 치료결정 단계로 진행합니다."]
      : ["1", "PD-L1 결과 확정", "호흡기내과에서 PD-L1 결과를 확인·확정합니다."],
    ["2", "치료계획 작성", "확정 결과를 바탕으로 치료 유형과 Regimen을 결정합니다."],
    ["3", "처방 및 안전성 확인", "임시 처방 생성 후 안전성 검사를 거쳐 최종 확정합니다."],
  ];

  return <section className="mx-auto flex w-full max-w-4xl flex-col rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-base font-bold text-amber-700">!</span>
      <div>
        <p className="text-xs font-semibold text-amber-700">치료계획·처방 진행 대기</p>
        <h2 className="mt-1 text-xl font-bold text-slate-800">{requiresPdl1StageDecision ? "다음 단계 결정이 필요합니다." : "PD-L1 호흡기내과 최종 확정이 필요합니다."}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{requiresPdl1StageDecision ? "상단의 다음 단계 결정으로 치료결정 단계에 진입한 뒤 치료계획을 작성하세요." : waitingMessage || "선행 검사 결과가 확정되면 치료계획과 처방을 이어서 진행할 수 있습니다."}</p>
      </div>
    </div>
    <ol className="mt-5 grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-3">
      {steps.map(([number, title, description]) => <li key={number} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{number}</span>
        <h3 className="mt-3 text-sm font-bold text-slate-800">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </li>)}
    </ol>
    <p className="mt-4 text-xs text-slate-500">{requiresPdl1StageDecision ? "치료결정 단계 진입 전에는 치료계획과 처방을 작성할 수 없습니다." : "PD-L1 확정 전에는 치료계획과 처방을 작성할 수 없습니다."}</p>
  </section>;
}

function CasePrescriptionItemRow({
  item,
  prescriptionId,
  editable,
  working,
  onSave,
  onDirtyChange,
}: {
  item: CasePrescriptionItem;
  prescriptionId: string;
  editable: boolean;
  working: boolean;
  onSave: (
    prescriptionId: string,
    itemId: string,
    finalDose: string,
    instructions: string
  ) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [finalDose, setFinalDose] = useState(
    item.final_dose !== null ? String(item.final_dose) : ""
  );
  const [instructions, setInstructions] = useState(
    item.instructions ?? ""
  );
  const baselineRef = useRef({ finalDose, instructions });
  const saveItem = async () => {
    await onSave(prescriptionId, item.id, finalDose, instructions);
    baselineRef.current = { finalDose, instructions };
    onDirtyChange(false);
  };

  return (
    <div className="border-t border-slate-100 px-3 py-3 first:border-t-0">
      <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2 text-xs">
        <span className="font-semibold text-slate-700">
          {item.drug_name}
          {item.ingredient_name && (
            <span className="ml-1 font-normal text-slate-400">
              {item.ingredient_name}
            </span>
          )}
        </span>
        <span className="text-slate-500">
          계산 {item.calculated_dose ?? "-"}{item.unit ?? ""}
        </span>
        <span className="text-slate-500">
          {item.route_label || "-"} · {item.frequency || "-"}
        </span>
        <span className="text-right text-slate-400">
          투여일 {item.administration_day || "-"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[160px_1fr_auto] gap-3">
        <label className="block">
          <span className="text-[11px] text-slate-400">최종 용량</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min="0"
              disabled={!editable}
              value={finalDose}
              onChange={(event) => { const value = event.target.value; setFinalDose(value); onDirtyChange(value !== baselineRef.current.finalDose || instructions !== baselineRef.current.instructions); }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 disabled:bg-slate-100"
            />
            <span className="text-xs text-slate-500">
              {item.unit}
            </span>
          </div>
        </label>

        <label className="block">
          <span className="text-[11px] text-slate-400">투여 지시</span>
          <input
            type="text"
            disabled={!editable}
            value={instructions}
            onChange={(event) => { const value = event.target.value; setInstructions(value); onDirtyChange(finalDose !== baselineRef.current.finalDose || value !== baselineRef.current.instructions); }}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 disabled:bg-slate-100"
          />
        </label>

        <div className="flex items-end">
          {editable && (
            <button
              type="button"
              disabled={working || finalDose === ""}
              onClick={saveItem}
              className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              수정 저장
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PatientInfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-slate-400">
        {label}
      </span>

      <span className="truncate text-[11px] font-semibold text-slate-700">
        {value}
      </span>
    </div>
  );
}

function SubMenuList<T extends string>({
  menus,
  selected,
  onSelect,
}: {
  menus: { key: T; label: string }[];
  selected: T;
  onSelect: (menu: T) => void;
}) {
  return (
    <div className="mt-1 space-y-1 border-l border-emerald-100 py-1 pl-3">
      {menus.map((menu) => (
        <button
          key={menu.key}
          type="button"
          onClick={() => onSelect(menu.key)}
          className={getSubMenuClass(
            selected === menu.key
          )}
        >
          {menu.label}
        </button>
      ))}
    </div>
  );
}

function getSubMenuClass(active: boolean) {
  return `w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
    active
      ? "bg-emerald-100 text-emerald-800"
      : "text-slate-600 hover:bg-emerald-50"
  }`;
}

function getMainMenuLabel(menu: MainMenu) {
  if (menu === "RESULTS")
    return "검사 결과";

  if (menu === "AI")
    return "AI 분석";

  if (menu === "TREATMENT")
    return "치료 결정";

  if (menu === "PRESCRIPTION")
    return "처방 관리";

  return menu;
}

function getDetailTitle(
  mainMenu: MainMenu,
  resultMenu: ResultSubMenu,
  aiMenu: AiSubMenu,
  treatmentMenu: TreatmentSubMenu,
  prescriptionMenu: PrescriptionSubMenu
) {
  if (mainMenu === "RESULTS") {
    return `${getResultMenuLabel(
      resultMenu
    )} 검사 결과`;
  }

  if (mainMenu === "AI") {
    return `${getAiMenuLabel(
      aiMenu
    )} AI 분석`;
  }

  if (mainMenu === "TREATMENT") {
    if (
      treatmentMenu ===
      "AI_RECOMMENDATION"
    ) {
      return "AI 치료 추천";
    }

    if (treatmentMenu === "REGIMEN") {
      return "치료요법 후보";
    }

    return "최종 치료계획";
  }

  if (
    prescriptionMenu ===
    "PRESCRIPTION_LIST"
  ) {
    return "처방 목록";
  }

  if (
    prescriptionMenu ===
    "SAFETY_CHECK"
  ) {
    return "안전성 검사";
  }

  return "최종 처방";
}

function getDetailDescription(
  mainMenu: MainMenu,
  treatmentMenu: TreatmentSubMenu,
  prescriptionMenu: PrescriptionSubMenu
) {
  if (mainMenu === "RESULTS") {
    return "검사 결과와 의료진 확정 정보를 이 영역에서 확인합니다.";
  }

  if (mainMenu === "AI") {
    return "AI 예측 결과와 의료진 확정 결과를 이 영역에서 비교합니다.";
  }

  if (mainMenu === "TREATMENT") {
    if (
      treatmentMenu ===
      "AI_RECOMMENDATION"
    ) {
      return "AI가 제시한 치료 추천과 근거를 확인합니다.";
    }

    if (treatmentMenu === "REGIMEN") {
      return "환자의 임상 조건에 맞는 치료요법 후보를 검토합니다.";
    }

    return "담당의가 최종 치료계획과 결정 근거를 확인하고 확정합니다.";
  }

  if (
    prescriptionMenu ===
    "PRESCRIPTION_LIST"
  ) {
    return "환자의 Cycle별 처방 내용을 확인하고 관리합니다.";
  }

  if (
    prescriptionMenu ===
    "SAFETY_CHECK"
  ) {
    return "처방약의 안전성 검사 결과를 확인합니다.";
  }

  return "안전성 검사가 완료된 최종 처방 내용을 확인합니다.";
}

function getSexLabel(sex: string) {
  if (sex === "M") return "남";
  if (sex === "F") return "여";

  return sex || "-";
}

function getStageLabel(stage: string) {
  if (stage === "XRAY")
    return "X-ray";

  if (stage === "CT")
    return "CT";

  if (stage === "PATHOLOGY_GENE")
    return "병리";

  if (stage === "PET_CT_TNM")
    return "TNM";

  if (stage === "PDL1")
    return "PD-L1";

  if (stage === "TREATMENT")
    return "치료 결정";

  if (stage === "PRESCRIPTION")
    return "처방";

  return stage;
}

function getResultMenuLabel(
  menu: ResultSubMenu
) {
  if (menu === "XRAY")
    return "X-ray";

  if (menu === "CT")
    return "CT";

  if (menu === "PATHOLOGY_GENE")
    return "병리";

  if (menu === "PET_CT_TNM")
    return "TNM";

  if (menu === "PDL1")
    return "PD-L1";

  return menu;
}

function getAiMenuLabel(
  menu: AiSubMenu
) {
  if (menu === "XRAY")
    return "X-ray";

  if (menu === "CT")
    return "CT";

  if (menu === "PATHOLOGY_GENE")
    return "병리";

  if (menu === "PET_CT_TNM")
    return "TNM";

  if (menu === "PDL1")
    return "PD-L1";

  return menu;
}

function PanelRetryError({ message, retrying, onRetry }: { message: string; retrying: boolean; onRetry: () => void }) {
  return <div role="alert" className="mb-3 flex items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700"><span>{message}</span><button type="button" disabled={retrying} onClick={onRetry} className="whitespace-nowrap rounded-md border border-rose-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-50">{retrying ? "재시도 중" : "이 패널 다시 시도"}</button></div>;
}

function getPanelFetchError(status: number, label: string) {
  if (status === 401) return `${label} 인증이 만료되었습니다. 다시 로그인해 주세요.`;
  if (status === 403) return `${label} 조회 권한이 없습니다.`;
  return `${label}를 불러오지 못했습니다.`;
}

function formatBirthDate(value: string) {
  if (!value) return "-";

  const [year, month, day] =
    value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${year}.${month}.${day}`;
}


function resultSyncSignature(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    return [record.id, record.status, record.result_status, record.completed_at, record.result_date].map((part) => String(part ?? "")).join(":");
  }).sort().join("|");
}

function orderSyncSignature(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (!item || typeof item !== "object") return "";
    const order = item as Record<string, unknown>;
    return [order.id, order.status, order.scheduled_at, order.appointment_status].map((part) => String(part ?? "")).join(":");
  }).sort().join("|");
}
