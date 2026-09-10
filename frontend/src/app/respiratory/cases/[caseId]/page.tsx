"use client";

import { useEffect, useRef, useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { useRespiratoryAuth } from "../../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../../_lib/respiratory-api";
import { PrescriptionSection, TreatmentSection } from "./treatment-prescription-sections";
import { CaseWorkspaceEmpty } from "./case-workspace-empty";
import { CaseSummaryHeader, CaseWorkflowBar } from "./case-workflow-header";
import { CurrentActionQueue } from "./current-action-queue";
import { ResultReviewPanel } from "./result-review-panel";
import { TnmReviewWorkspace } from "./tnm-review-workspace";
import { CasePatientSidebar } from "./case-patient-sidebar";
import { BottomActionBar } from "./bottom-action-bar";
import { CaseInfoKey, CaseInfoMenu } from "./case-info-menu";
import { CaseOverviewPanel } from "./case-overview-panel";
import { BiomarkerSourceHeader } from "./biomarker-source-header";
import { TreatmentPrescriptionOverview } from "./treatment-prescription-overview";
import { CaseChangeDialog } from "./case-change-dialog";
import { deriveCurrentActions } from "../../_lib/derive-current-actions";
import { hasChangedFields, hasPrescriptionDraftChanges, hasUnsavedCaseChanges as combineUnsavedCaseChanges } from "../../_lib/case-dirty-state";
import { canApplyCaseResponse } from "../../_lib/case-request-guard";

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

type Pdl1Result = {
  id: string;
  analysis_type: string;
  analysis_type_label: string;
  status: string;
  status_label: string;
  model_name: string;
  model_version_name: string;
  completed_at: string | null;
  error_message: string | null;
  result_detail: {
    pdl1?: {
      predicted_class: number;
      predicted_tps_range: string;
      predicted_tps_range_label: string;
      confidence: string | number;
      probabilities: {
        class_0: number;
        class_1: number;
        class_2: number;
      };
    };
  };
  created_at: string;
};

type TnmAnalysisResult = {
  id?: string;
  analysis_type: string;
  analysis_type_label?: string;
  status?: string;
  status_label?: string;
  model_name?: string;
  model_version_name?: string;
  completed_at?: string | null;
  result_detail: {
    tnm?: {
      predicted_t: string | null;
      predicted_n: string | null;
      predicted_m: string | null;
      predicted_stage_group: string | null;
      confidence: number | string | null;
    };
  } | null;
};

type TnmClinicalResult = {
  id?: string;
  exam_type: string;
  exam_name?: string;
  result_status?: string;
  result_status_label?: string;
  result_date?: string | null;
  result_detail: {
    tnm?: {
      t_category: string | null;
      n_category: string | null;
      m_category: string | null;
      stage_group: string | null;
      evidence: unknown;
      note: string | null;
    };
  };
};

type GeneAnalysisResult = {
  analysis_type: string;
  result_detail: {
    genes?: {
      gene_symbol: string;
      predicted_status: string;
      predicted_status_label: string;
      predicted_probability: number | string | null;
    }[];
  } | null;
};

type GeneClinicalResult = {
  exam_type: string;
  result_date: string | null;
  result_detail: {
    gene?: {
      interpretation: string | null;
      additional_test_recommended: boolean;
      findings: {
        gene_symbol: string;
        assessment: string;
        assessment_label: string;
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
  ai_recommendation_action: string | null;
  ai_recommendation_action_label: string | null;
  treatment_type: string | null;
  treatment_type_label: string | null;
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
  | "PATHOLOGY"
  | "STAGING"
  | "GENE";

type AiSubMenu =
  | "XRAY"
  | "CT"
  | "PATHOLOGY"
  | "STAGING"
  | "GENE";

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
    description: "처방 및 Safety Check",
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
    key: "PATHOLOGY",
    label: "병리",
  },
  {
    key: "STAGING",
    label: "TNM",
  },
  {
    key: "GENE",
    label: "유전자 & PD-L1",
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
    key: "PATHOLOGY",
    label: "병리",
  },
  {
    key: "STAGING",
    label: "TNM",
  },
  {
    key: "GENE",
    label: "유전자 & PD-L1",
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
  { key: "XRAY", label: "흉부 X선" }, { key: "CT", label: "흉부 CT" }, { key: "PATHOLOGY", label: "병리" }, { key: "STAGING", label: "TNM 병기" }, { key: "GENE", label: "바이오마커" },
];
const workspaceAiSubMenus: typeof aiSubMenus = [
  { key: "XRAY", label: "흉부 X선" }, { key: "CT", label: "흉부 CT" }, { key: "PATHOLOGY", label: "병리" }, { key: "STAGING", label: "TNM 검토" }, { key: "GENE", label: "바이오마커" },
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
  const params = useParams();
  const router = useRouter();
  const { authorizedFetch } = useRespiratoryAuth();

  const caseId = params.caseId as string;
  const isPreview = caseId === "preview";

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [selectedCase, setSelectedCase] =
    useState<CaseItem | null>(null);

  const [searchText, setSearchText] = useState("");

  const [selectedMainMenu, setSelectedMainMenu] =
  useState<MainMenu>("AI");
  const [selectedInfoMenu, setSelectedInfoMenu] = useState<CaseInfoKey>("STAGING");

  const [expandedMainMenu, setExpandedMainMenu] =
  useState<MainMenu | null>("AI");

  const [selectedResultMenu, setSelectedResultMenu] =
  useState<ResultSubMenu>("XRAY");

  const [selectedAiMenu, setSelectedAiMenu] =
  useState<AiSubMenu>("STAGING");

  const [pdl1Results, setPdl1Results] =
  useState<Pdl1Result[]>([]);

  const [tnmAnalysisResults, setTnmAnalysisResults] =
  useState<TnmAnalysisResult[]>([]);

  const [tnmClinicalResults, setTnmClinicalResults] =
  useState<TnmClinicalResult[]>([]);

  const [regimenCandidates, setRegimenCandidates] =
  useState<CaseRegimenCandidate[]>([]);

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
  const [panelRetrying, setPanelRetrying] = useState<"REGIMEN" | "TREATMENT" | "PRESCRIPTION" | null>(null);
  const activeCaseIdRef = useRef(caseId);
  useEffect(() => { activeCaseIdRef.current = caseId; }, [caseId]);

  const [selectedTreatmentMenu, setSelectedTreatmentMenu] =
  useState<TreatmentSubMenu>("AI_RECOMMENDATION");

  const [selectedPrescriptionMenu, setSelectedPrescriptionMenu] =
  useState<PrescriptionSubMenu>("PRESCRIPTION_LIST");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clinicalResultError, setClinicalResultError] = useState("");
  const [aiResultError, setAiResultError] = useState("");
  const [resultRetryVersion, setResultRetryVersion] = useState(0);
  const [tnmDirty, setTnmDirty] = useState(false);
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null);
  const [prescriptionItemDirty, setPrescriptionItemDirty] = useState<Record<string, boolean>>({});
  const caseTriggerRef = useRef<HTMLElement | null>(null);

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
    if (isPreview) return;
    const controller = new AbortController();
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
        setRegimenCandidates([]);
        setCaseTreatmentDecision(null);
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

        if (!controller.signal.aborted) { setCases(caseListData); setSelectedCase(caseDetailData); }
        setPdl1Results([]);

        const [tnmAnalysisResponse, tnmClinicalResponse] =
          await Promise.all([
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/ai-results/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/clinical-results/`, { signal: controller.signal }),
          ]);

        if (tnmAnalysisResponse.ok) {
          const tnmAnalysisData: TnmAnalysisResult[] =
            await tnmAnalysisResponse.json();

          if (!controller.signal.aborted) setTnmAnalysisResults(tnmAnalysisData);
        } else if (!controller.signal.aborted) {
          setAiResultError(getPanelFetchError(tnmAnalysisResponse.status, "AI 결과"));
        }

        if (tnmClinicalResponse.ok) {
          const tnmClinicalData: TnmClinicalResult[] =
            await tnmClinicalResponse.json();

          if (!controller.signal.aborted) setTnmClinicalResults(tnmClinicalData);
        } else if (!controller.signal.aborted) {
          setClinicalResultError(getPanelFetchError(tnmClinicalResponse.status, "전문과 결과"));
        }

        const regimenCandidateResponse = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/regimen-candidates/`, { signal: controller.signal });

        if (regimenCandidateResponse.ok) {
          const regimenCandidateData: CaseRegimenCandidate[] =
            await regimenCandidateResponse.json();

          if (!controller.signal.aborted) setRegimenCandidates(regimenCandidateData);
        } else if (!controller.signal.aborted) {
          setRegimenLoadError(getPanelFetchError(regimenCandidateResponse.status, "Regimen 후보"));
        }

        const treatmentDecisionResponse = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/treatment-decision/`, { signal: controller.signal });

        if (treatmentDecisionResponse.ok) {
          const treatmentDecisionData: CaseTreatmentDecision =
            await treatmentDecisionResponse.json();

          if (controller.signal.aborted) return;
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
        } else if (treatmentDecisionResponse.status === 404) {
          setCaseTreatmentDecision(null);
          setCaseTreatmentForm({
            treatment_type: "",
            selected_regimen: "",
            treatment_plan: "",
            targeted_therapy_plan: "",
            rationale: "",
          });
        } else if (!controller.signal.aborted) {
          setTreatmentLoadError(getPanelFetchError(treatmentDecisionResponse.status, "치료 결정"));
        }

        const prescriptionResponse = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/`, { signal: controller.signal });

        if (prescriptionResponse.ok) {
          const prescriptionData: CasePrescription[] =
            await prescriptionResponse.json();

          if (!controller.signal.aborted) setCasePrescriptions(prescriptionData);
        } else {
          setPrescriptionLoadError(getPanelFetchError(prescriptionResponse.status, "처방 목록"));
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : "Case 조회 중 오류가 발생했습니다."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    if (caseId) {
      fetchData();
    }
    return () => controller.abort();
  }, [authorizedFetch, caseId, isPreview, resultRetryVersion]);

  const filteredCases = cases.filter((item) => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) {
      return true;
    }

    return (
      item.patient_name.toLowerCase().includes(keyword) ||
      item.patient_code.toLowerCase().includes(keyword) ||
      item.case_code.toLowerCase().includes(keyword)
    );
  });

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
    setPanelRetrying(panel);
    try {
      if (panel === "REGIMEN") {
        setRegimenLoadError("");
        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${requestCaseId}/regimen-candidates/`);
        if (!response.ok) throw new Error(getPanelFetchError(response.status, "Regimen 후보"));
        const data: CaseRegimenCandidate[] = await response.json();
        if (canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) setRegimenCandidates(data);
      } else if (panel === "TREATMENT") {
        setTreatmentLoadError("");
        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${requestCaseId}/treatment-decision/`);
        if (response.status === 404) { if (canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) setCaseTreatmentDecision(null); return; }
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
    } catch (retryError) {
      if (!canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) return;
      const message = retryError instanceof Error ? retryError.message : "패널 조회에 실패했습니다.";
      if (panel === "REGIMEN") setRegimenLoadError(message);
      else if (panel === "TREATMENT") setTreatmentLoadError(message);
      else setPrescriptionLoadError(message);
    } finally {
      if (canApplyCaseResponse(requestCaseId, activeCaseIdRef.current, false)) setPanelRetrying(null);
    }
  };

  const handleMainMenuClick = (menu: MainMenu) => {
    setSelectedMainMenu(menu);
    setExpandedMainMenu((current) =>
      current === menu ? null : menu
    );
  };

  const handleInfoMenuSelect = (menu: CaseInfoKey) => {
    setSelectedInfoMenu(menu);
    if (menu === "OVERVIEW") return;
    if (["XRAY", "CT", "PATHOLOGY"].includes(menu)) {
      setSelectedMainMenu("RESULTS");
      setSelectedResultMenu(menu as ResultSubMenu);
      return;
    }
    if (menu === "STAGING" || menu === "GENE") {
      setSelectedMainMenu("AI");
      setSelectedAiMenu(menu);
      return;
    }
    if (menu === "TREATMENT" || menu === "PRESCRIPTION") {
      setSelectedMainMenu(menu);
    }
  };

  const latestPdl1Result =
    pdl1Results.length > 0
        ? pdl1Results[0]
        : null;

  const tnmAnalysisResult = tnmAnalysisResults.find(
    (result) => result.analysis_type === "TNM_STAGING"
  );

  const tnmAnalysis =
    tnmAnalysisResult?.result_detail?.tnm;

  const tnmClinicalResult = tnmClinicalResults.find(
    (result) => result.exam_type === "STAGING"
  );

  const tnmClinical =
    tnmClinicalResult?.result_detail?.tnm;

  const geneAnalysisResult = tnmAnalysisResults.find(
    (result) => result.analysis_type === "GENE_PREDICTION"
  ) as GeneAnalysisResult | undefined;

  const geneClinicalResult = tnmClinicalResults.find(
    (result) => result.exam_type === "GENE"
  ) as GeneClinicalResult | undefined;

  const treatmentAnalysisResult = tnmAnalysisResults.find(
    (result) => result.analysis_type === "TREATMENT_RECOMMENDATION"
  ) as TreatmentAnalysisResult | undefined;

  const treatmentAnalysis =
    treatmentAnalysisResult?.result_detail?.treatment;

  const currentActions = selectedCase
    ? deriveCurrentActions(
        selectedCase,
        tnmClinicalResults,
        tnmAnalysisResults,
        casePrescriptions,
      )
    : [];

  const selectedClinicalResult = tnmClinicalResults.find(
    (result) => result.exam_type === selectedResultMenu,
  );

  const selectedAiType = {
    XRAY: "XRAY_SCREENING",
    CT: "CT_NODULE",
    PATHOLOGY: "PATHOLOGY_DIAGNOSIS",
    STAGING: "TNM_STAGING",
    GENE: "GENE_PREDICTION",
  }[selectedResultMenu];

  const selectedAiResult = tnmAnalysisResults.find(
    (result) => result.analysis_type === selectedAiType,
  );

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
    if (!caseId) return;

    try {
      setCasePrescriptionWorking(true);
      setCasePrescriptionError("");
      setCasePrescriptionMessage("");

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
    } catch (err) {
      setCasePrescriptionError(
        err instanceof Error ? err.message : "처방 생성에 실패했습니다."
      );
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
    if (!caseId) return;

    try {
      setCasePrescriptionWorking(true);
      setCasePrescriptionError("");
      setCasePrescriptionMessage("");

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
    } catch (err) {
      setCasePrescriptionError(
        err instanceof Error
          ? err.message
          : "처방 약물 수정에 실패했습니다."
      );
    } finally {
      setCasePrescriptionWorking(false);
    }
  };

  const handleCasePrescriptionSafetyCheck = async (
    prescriptionId: string
  ) => {
    if (!caseId) return;

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
        throw new Error(data.detail || "Safety Check에 실패했습니다.");
      }

      const prescriptionResponse = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/`);

      if (!prescriptionResponse.ok) {
        throw new Error("처방 목록을 불러오지 못했습니다.");
      }

      const prescriptionData: CasePrescription[] =
        await prescriptionResponse.json();

      setCasePrescriptions(prescriptionData);
      setCasePrescriptionMessage("Safety Check가 완료되었습니다.");
    } catch (err) {
      setCasePrescriptionError(
        err instanceof Error ? err.message : "Safety Check에 실패했습니다."
      );
    } finally {
      setCasePrescriptionWorking(false);
    }
  };

  const handleCasePrescriptionAcknowledgeWarnings = async (
    prescriptionId: string
  ) => {
    if (!caseId) return;

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
    prescriptionId: string
  ) => {
    if (!caseId) return;

    const confirmed = window.confirm(
      "처방을 최종 확정하면 이후 수정할 수 없습니다.\n계속하시겠습니까?"
    );

    if (!confirmed) return;

    try {
      setCasePrescriptionWorking(true);
      setCasePrescriptionError("");
      setCasePrescriptionMessage("");

      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/finalize/`,
        {
          method: "POST",
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
    } catch (err) {
      setCasePrescriptionError(
        err instanceof Error
          ? err.message
          : "처방 최종 확정에 실패했습니다."
      );
    } finally {
      setCasePrescriptionWorking(false);
    }
  };

  if (isPreview) {
    if (process.env.NODE_ENV === "production") notFound();
    return <CaseWorkspaceEmpty isPreview />;
  }

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
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50">
      <CaseSummaryHeader caseData={selectedCase} />
      <div className="grid min-h-0 flex-1 grid-cols-[235px_165px_minmax(1040px,1fr)] overflow-x-auto overflow-y-hidden">
      <CasePatientSidebar cases={filteredCases} selectedId={caseId} searchText={searchText} onSearchChange={setSearchText} onSelect={handleCaseSelect} />

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

      <CaseInfoMenu selected={selectedInfoMenu} onSelect={handleInfoMenuSelect} />

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
                    onSelect={setSelectedResultMenu}
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

      {/* D. 상세 영역 */}
      <main className={selectedInfoMenu === "STAGING" ? "grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_52px] overflow-hidden p-2 pb-0" : "min-w-0 overflow-y-auto p-3"}>
        <CaseWorkflowBar currentStage={selectedCase.current_stage} />
        <CurrentActionQueue actions={currentActions} onNavigate={(href) => router.push(href)} />
        {selectedMainMenu === "TREATMENT" && selectedTreatmentMenu === "REGIMEN" && regimenLoadError && <PanelRetryError message={regimenLoadError} retrying={panelRetrying === "REGIMEN"} onRetry={() => retryPanel("REGIMEN")} />}
        {selectedMainMenu === "TREATMENT" && selectedTreatmentMenu === "FINAL_PLAN" && treatmentLoadError && <PanelRetryError message={treatmentLoadError} retrying={panelRetrying === "TREATMENT"} onRetry={() => retryPanel("TREATMENT")} />}
        {selectedMainMenu === "PRESCRIPTION" && prescriptionLoadError && <PanelRetryError message={prescriptionLoadError} retrying={panelRetrying === "PRESCRIPTION"} onRetry={() => retryPanel("PRESCRIPTION")} />}
        <div className={selectedInfoMenu === "STAGING" ? "hidden" : "mb-3 flex h-11 items-center justify-between border-b border-slate-200 px-1"}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-5 w-1 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-slate-900">
              {getDetailTitle(
                selectedMainMenu,
                selectedResultMenu,
                selectedAiMenu,
                selectedTreatmentMenu,
                selectedPrescriptionMenu
              )}
              </h1>
              <p className="truncate text-[10px] text-slate-400">
              {selectedCase.patient_name} ·{" "}
              {selectedCase.patient_code} ·{" "}
              {selectedCase.case_code}
              </p>
            </div>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-semibold text-blue-700">
            {getStageLabel(
              selectedCase.current_stage
            )}
          </span>
        </div>

        {(selectedInfoMenu === "TREATMENT" || selectedInfoMenu === "PRESCRIPTION") && (
          <TreatmentPrescriptionOverview treatment={caseTreatmentDecision} prescriptions={casePrescriptions} />
        )}

        {selectedInfoMenu === "OVERVIEW" ? (
          <CaseOverviewPanel caseData={selectedCase} clinicalResults={tnmClinicalResults} aiResults={tnmAnalysisResults} />
        ) : selectedMainMenu === "PRESCRIPTION" &&
        selectedPrescriptionMenu === "PRESCRIPTION_LIST" ? (
          <PrescriptionSection className="grid grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)] items-start gap-3">
            <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
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
                <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {casePrescriptionMessage}
                </p>
              )}

              <div className="mt-3 space-y-2">
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
                          {prescription.regimen_detail.regimen_code} · Cycle {prescription.cycle_number} · {prescription.phase_label}
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
                        {prescription.prescription_status_label}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-slate-400">Phase</p>
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

                    {prescription.prescription_status === "VALIDATED" && (
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={
                            casePrescriptionWorking ||
                            prescription.safety_check_results.some(
                              (result) => result.result === "BLOCK"
                            ) ||
                            prescription.safety_check_results.some(
                              (result) =>
                                result.result === "WARNING" &&
                                !result.acknowledged_at
                            )
                          }
                          onClick={() =>
                            handleCasePrescriptionFinalize(prescription.id)
                          }
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {casePrescriptionWorking
                            ? "처리 중..."
                            : "처방 최종 확정"}
                        </button>
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

            <section className="rounded-lg border border-sky-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-sky-600">
                확정 치료결정 기반
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-800">
                새 처방 생성
              </h2>

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
                    Phase
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
            </section>
          </PrescriptionSection>
        ) : selectedMainMenu === "TREATMENT" &&
        selectedTreatmentMenu === "FINAL_PLAN" ? (
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
                    {caseTreatmentDecision.ai_recommendation_action_label ??
                      caseTreatmentDecision.ai_recommendation_action}
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

          {regimenCandidates.length > 0 ? (
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
        selectedAiMenu === "STAGING" ? (
        <div className="min-h-0 overflow-hidden">
          <TnmReviewWorkspace
            key={caseId}
            aiTnm={tnmAnalysis}
            clinicalTnm={tnmClinical}
            modelName={tnmAnalysisResult?.model_name}
            modelVersion={tnmAnalysisResult?.model_version_name}
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
        selectedAiMenu === "GENE" ? (
        <Pdl1AiPanel
          result={latestPdl1Result}
          geneAnalysisResult={geneAnalysisResult}
          geneClinicalResult={geneClinicalResult}
        />
        ) : selectedMainMenu === "RESULTS" ? (
        <ResultReviewPanel
          stage={selectedResultMenu}
          clinicalResult={selectedClinicalResult}
          aiResult={selectedAiResult}
          clinicalError={clinicalResultError}
          aiError={aiResultError}
          onRetry={() => setResultRetryVersion((current) => current + 1)}
        />
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
        {selectedInfoMenu === "STAGING" && <BottomActionBar />}
        </main>
        </div>
        {pendingCaseId && <CaseChangeDialog onCancel={() => setPendingCaseId(null)} onDiscard={discardDraftAndMove} returnFocusRef={caseTriggerRef} />}
        </div>
    );
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
      return "Regimen 후보";
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
    return "Safety Check";
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
      return "환자의 임상 조건에 맞는 Regimen 후보를 검토합니다.";
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

  return "Safety Check가 완료된 최종 처방 내용을 확인합니다.";
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

  if (stage === "PATHOLOGY")
    return "병리";

  if (stage === "STAGING")
    return "TNM";

  if (stage === "GENE")
    return "유전자 & PD-L1";

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

  if (menu === "PATHOLOGY")
    return "병리";

  if (menu === "STAGING")
    return "TNM";

  if (menu === "GENE")
    return "유전자 & PD-L1";

  return menu;
}

function getAiMenuLabel(
  menu: AiSubMenu
) {
  if (menu === "XRAY")
    return "X-ray";

  if (menu === "CT")
    return "CT";

  if (menu === "PATHOLOGY")
    return "병리";

  if (menu === "STAGING")
    return "TNM";

  if (menu === "GENE")
    return "유전자 & PD-L1";

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

function Pdl1AiPanel({
  result,
  geneAnalysisResult,
  geneClinicalResult,
}: {
  result: Pdl1Result | null;
  geneAnalysisResult?: GeneAnalysisResult;
  geneClinicalResult?: GeneClinicalResult;
}) {
  const genes =
    geneAnalysisResult?.result_detail?.genes ?? [];
  const geneFindings =
    geneClinicalResult?.result_detail.gene?.findings ?? [];
  const geneSymbols = Array.from(
    new Set([
      ...genes.map((gene) => gene.gene_symbol),
      ...geneFindings.map((finding) => finding.gene_symbol),
    ])
  );
  const pdl1 = result?.result_detail?.pdl1;
  const clinicalPdl1 =
    geneClinicalResult?.result_detail.pdl1;

  const confidence = pdl1
    ? Number(pdl1.confidence) * 100
    : null;

  const class0 = pdl1
    ? pdl1.probabilities.class_0 * 100
    : null;

  const class1 = pdl1
    ? pdl1.probabilities.class_1 * 100
    : null;

  const class2 = pdl1
    ? pdl1.probabilities.class_2 * 100
    : null;

  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-start gap-4">
      <BiomarkerSourceHeader />
      <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-semibold text-slate-500">유전자 검사</p><p className="mt-0.5 text-base font-bold text-slate-800">
            유전자 결과 비교
          </p>
          <p className="mt-1 text-xs text-slate-400">
            전문과 확정 결과와 유전자 AI 분석 결과를 항목별로 비교합니다.
          </p>
          </div>
          <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">확정 결과 우선</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
          <div className="grid grid-cols-[0.8fr_1fr_0.7fr_1fr] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
            <span>유전자</span>
            <span>AI 분석 결과</span>
            <span>AI 확률</span>
            <span>전문과 확정</span>
          </div>
          {geneSymbols.map((geneSymbol) => {
            const gene = genes.find(
              (item) => item.gene_symbol === geneSymbol
            );
            const finding = geneFindings.find(
              (item) => item.gene_symbol === geneSymbol
            );

            return (
              <div
                key={geneSymbol}
                className="grid grid-cols-[0.8fr_1fr_0.7fr_1fr] gap-2 border-t border-slate-100 px-3 py-2.5 text-xs"
              >
                <span className="font-bold text-slate-700">
                  {geneSymbol}
                </span>
                <span className="text-emerald-700">
                  {gene?.predicted_status_label ?? "AI 결과 없음"}
                </span>
                <span className="text-slate-500">
                  {gene?.predicted_probability !== null &&
                  gene?.predicted_probability !== undefined
                    ? Number(gene.predicted_probability) <= 1
                      ? `${(
                          Number(gene.predicted_probability) * 100
                        ).toFixed(1)}%`
                      : `${Number(gene.predicted_probability)}%`
                    : "-"}
                </span>
                <span className="text-sky-700">
                  {finding?.assessment_label ?? "확정 결과 없음"}
                </span>
                {finding?.note && (
                  <span
                    title={finding.note}
                    className="col-span-4 truncate text-[11px] text-slate-400"
                  >
                    {finding.note}
                  </span>
                )}
              </div>
            );
          })}
          {geneSymbols.length === 0 && (
            <div className="border-t border-slate-100 px-3 py-8 text-center text-xs text-slate-400">
              조회된 유전자 AI 분석 결과와 전문과 확정 결과가 없습니다.
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold text-slate-400">
              전문과 종합 해석
            </p>
            <p className="mt-1 break-words text-xs text-slate-600">
              {geneClinicalResult?.result_detail.gene?.interpretation ??
                "확정 결과 없음"}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold text-slate-400">
              전문과 추가 검사 권고
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              {geneClinicalResult?.result_detail.gene
                ? geneClinicalResult.result_detail.gene
                    .additional_test_recommended
                  ? "필요"
                  : "없음"
                : "확정 결과 없음"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold text-slate-500">PD-L1 검사</p>
            <p className="mt-0.5 text-base font-bold text-slate-800">
              PD-L1 결과 비교
            </p>
            <p className="mt-1 text-xs text-slate-400">
              전문과 확정 TPS와 AI 예측 구간을 서로 다른 출처로 표시합니다.
            </p>
          </div>
          {result && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {result.status_label}
            </span>
          )}
        </div>

        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          PD-L1 AI 결과는 인증 연결 전까지 조회할 수 없습니다. 전문과 확정 TPS는 임상 결과에서 계속 표시됩니다.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-[10px] font-semibold text-blue-600">PD-L1 AI 분석 후보</p>
            <p className="text-xs font-medium text-slate-500">
              예측 TPS 구간
            </p>
            <p className="mt-2 text-xl font-bold text-blue-700">
              {pdl1?.predicted_tps_range_label ?? "인증 연동 대기"}
            </p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-[10px] font-semibold text-blue-600">PD-L1 AI 분석 후보</p>
            <p className="text-xs font-medium text-slate-500">
              분석 신뢰도
            </p>
            <p className="mt-2 text-xl font-bold text-slate-700">
              {confidence !== null ? `${confidence.toFixed(2)}%` : "-"}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
            <p className="text-[10px] font-semibold text-emerald-600">전문과 확정 결과</p>
            <p className="text-xs font-medium text-slate-500">
              확정 TPS
            </p>
            <p className="mt-2 text-xl font-bold text-emerald-700">
              {clinicalPdl1?.tps_percent !== null &&
              clinicalPdl1?.tps_percent !== undefined
                ? `${clinicalPdl1.tps_percent}%`
                : "확정 결과 없음"}
            </p>
          </div>
        </div>

        {pdl1 && class0 !== null && class1 !== null && class2 !== null && (
          <div className="mt-3 rounded-xl border border-slate-100 px-4 py-3">
            <div className="grid grid-cols-3 gap-2">
              <ProbabilityCard label="<1%" value={class0} />
              <ProbabilityCard label="1–49%" value={class1} />
              <ProbabilityCard label="≥50%" value={class2} />
            </div>
          </div>
        )}

        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 px-4 py-3 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">전문과 확정 해석</span>
            <span className="min-w-0 break-words text-right font-medium text-slate-600">
              {clinicalPdl1?.interpretation ?? "확정 결과 없음"}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">전문과 판독 소견</span>
            <span className="min-w-0 break-words text-right font-medium text-slate-600">
              {clinicalPdl1?.note ?? "-"}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">결과일</span>
            <span className="text-right font-medium text-slate-600">
              {geneClinicalResult?.result_date ?? "-"}
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-slate-100 px-4 py-3 text-xs">
          <span className="text-slate-400">모델</span>
          <span className="text-right font-medium text-slate-600">
            {result ? `${result.model_name} ${result.model_version_name}` : "-"}
          </span>
          <span className="text-slate-400">완료일</span>
          <span className="text-right font-medium text-slate-600">
            {result?.completed_at ?? "-"}
          </span>
        </div>

        <p className="mt-3 text-[11px] leading-5 text-amber-700">
          AI 결과는 TPS 예측 구간이며 전문과 확정 결과는 실제 TPS 값입니다. 두 결과는 서로 대체되지 않습니다.
        </p>
      </section>
    </div>
  );
}

function ProbabilityCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-lg font-bold text-slate-800">
        {value.toFixed(2)}%
      </p>
    </div>
  );
}
