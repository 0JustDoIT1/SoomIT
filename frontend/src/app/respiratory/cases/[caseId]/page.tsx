"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
  analysis_type: string;
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
  exam_type: string;
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
  safety_check_results: { id: string }[];
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
    label: "Regimen 후보",
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
    label: "Safety Check",
  },
  {
    key: "FINAL_PRESCRIPTION",
    label: "최종 처방",
  },
];

export default function RespiratoryCaseDetailPage() {
  const params = useParams();
  const router = useRouter();

  const caseId = params.caseId as string;

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [selectedCase, setSelectedCase] =
    useState<CaseItem | null>(null);

  const [searchText, setSearchText] = useState("");

  const [selectedMainMenu, setSelectedMainMenu] =
    useState<MainMenu>("RESULTS");

  const [expandedMainMenu, setExpandedMainMenu] =
    useState<MainMenu | null>("RESULTS");

  const [selectedResultMenu, setSelectedResultMenu] =
  useState<ResultSubMenu>("XRAY");

  const [selectedAiMenu, setSelectedAiMenu] =
  useState<AiSubMenu>("CT");

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

  const [selectedTreatmentMenu, setSelectedTreatmentMenu] =
  useState<TreatmentSubMenu>("AI_RECOMMENDATION");

  const [selectedPrescriptionMenu, setSelectedPrescriptionMenu] =
  useState<PrescriptionSubMenu>("PRESCRIPTION_LIST");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");
        setCaseTreatmentConfirmed(false);
        setCasePrescriptionError("");
        setCasePrescriptionMessage("");
        setCasePrescriptions([]);

        const loginResponse = await fetch(
          "http://127.0.0.1:8000/api/auth/staff/login/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              hospital_code: "SUMIT001",
              username: "doctor01",
              password: "test1234",
            }),
          }
        );

        if (!loginResponse.ok) {
          throw new Error("의료진 로그인에 실패했습니다.");
        }

        const loginData = await loginResponse.json();

        const headers = {
          Authorization: `Bearer ${loginData.access}`,
        };

        const [caseListResponse, caseDetailResponse] =
          await Promise.all([
            fetch(
              "http://127.0.0.1:8000/api/doctor/cases/",
              { headers }
            ),
            fetch(
              `http://127.0.0.1:8000/api/doctor/cases/${caseId}/`,
              { headers }
            ),
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

        setCases(caseListData);
        setSelectedCase(caseDetailData);

        const pdl1Response = await fetch(
        `http://127.0.0.1:8000/api/pathology/cases/${caseId}/pdl1-results/`,
        {
            headers: {
            Authorization: `Basic ${btoa("doctor01:test1234")}`,
            },
        }
        );

        if (pdl1Response.ok) {
        const pdl1Data: Pdl1Result[] =
            await pdl1Response.json();

        setPdl1Results(pdl1Data);
        }

        const [tnmAnalysisResponse, tnmClinicalResponse] =
          await Promise.all([
            fetch(
              `http://127.0.0.1:8000/api/doctor/cases/${caseId}/ai-results/`,
              { headers }
            ),
            fetch(
              `http://127.0.0.1:8000/api/doctor/cases/${caseId}/clinical-results/`,
              { headers }
            ),
          ]);

        if (tnmAnalysisResponse.ok) {
          const tnmAnalysisData: TnmAnalysisResult[] =
            await tnmAnalysisResponse.json();

          setTnmAnalysisResults(tnmAnalysisData);
        }

        if (tnmClinicalResponse.ok) {
          const tnmClinicalData: TnmClinicalResult[] =
            await tnmClinicalResponse.json();

          setTnmClinicalResults(tnmClinicalData);
        }

        const regimenCandidateResponse = await fetch(
          `http://127.0.0.1:8000/api/doctor/cases/${caseId}/regimen-candidates/`,
          { headers }
        );

        if (regimenCandidateResponse.ok) {
          const regimenCandidateData: CaseRegimenCandidate[] =
            await regimenCandidateResponse.json();

          setRegimenCandidates(regimenCandidateData);
        }

        const treatmentDecisionResponse = await fetch(
          `http://127.0.0.1:8000/api/doctor/cases/${caseId}/treatment-decision/`,
          { headers }
        );

        if (treatmentDecisionResponse.ok) {
          const treatmentDecisionData: CaseTreatmentDecision =
            await treatmentDecisionResponse.json();

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
        }

        const prescriptionResponse = await fetch(
          `http://127.0.0.1:8000/api/doctor/cases/${caseId}/prescriptions/`,
          { headers }
        );

        if (prescriptionResponse.ok) {
          const prescriptionData: CasePrescription[] =
            await prescriptionResponse.json();

          setCasePrescriptions(prescriptionData);
        } else {
          setCasePrescriptionError("처방 목록을 불러오지 못했습니다.");
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Case 조회 중 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    };

    if (caseId) {
      fetchData();
    }
  }, [caseId]);

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

    router.push(`/respiratory/cases/${id}`);
  };

  const handleMainMenuClick = (menu: MainMenu) => {
    setSelectedMainMenu(menu);
    setExpandedMainMenu((current) =>
      current === menu ? null : menu
    );
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

  const handleCaseTreatmentDraftSave = async () => {
    if (!caseId) return;

    try {
      setCaseTreatmentSaving(true);
      setCaseTreatmentError("");
      setCaseTreatmentMessage("");

      const loginResponse = await fetch(
        "http://127.0.0.1:8000/api/auth/staff/login/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hospital_code: "SUMIT001",
            username: "doctor01",
            password: "test1234",
          }),
        }
      );

      if (!loginResponse.ok) {
        throw new Error("의료진 로그인에 실패했습니다.");
      }

      const loginData = await loginResponse.json();

      const response = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/treatment-decision/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${loginData.access}`,
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

      const loginResponse = await fetch(
        "http://127.0.0.1:8000/api/auth/staff/login/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hospital_code: "SUMIT001",
            username: "doctor01",
            password: "test1234",
          }),
        }
      );

      if (!loginResponse.ok) {
        throw new Error("의료진 로그인에 실패했습니다.");
      }

      const loginData = await loginResponse.json();

      const response = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/treatment-decision/confirm/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${loginData.access}`,
          },
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

      const loginResponse = await fetch(
        "http://127.0.0.1:8000/api/auth/staff/login/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hospital_code: "SUMIT001",
            username: "doctor01",
            password: "test1234",
          }),
        }
      );

      if (!loginResponse.ok) {
        throw new Error("의료진 로그인에 실패했습니다.");
      }

      const loginData = await loginResponse.json();
      const headers = {
        Authorization: `Bearer ${loginData.access}`,
      };

      const response = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/prescriptions/`,
        {
          method: "POST",
          headers: {
            ...headers,
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

      const prescriptionResponse = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/prescriptions/`,
        { headers }
      );

      if (!prescriptionResponse.ok) {
        throw new Error("처방 목록을 불러오지 못했습니다.");
      }

      const prescriptionData: CasePrescription[] =
        await prescriptionResponse.json();

      setCasePrescriptions(prescriptionData);
      setCasePrescriptionMessage("처방 DRAFT가 생성되었습니다.");
    } catch (err) {
      setCasePrescriptionError(
        err instanceof Error ? err.message : "처방 생성에 실패했습니다."
      );
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
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600">
        {error || "Case를 찾을 수 없습니다."}
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-80px)] w-full overflow-hidden bg-slate-50">

      {/* A. 담당 환자 목록 */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white">
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

      {/* B. 업무 대분류 */}
      <aside
        style={{ width: "220px" }}
        className="shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-3 py-5"
      >
        <div className="mb-4 flex items-center gap-2 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
            B
          </span>

          <h2 className="text-sm font-bold text-slate-700">
            업무 대분류
          </h2>
        </div>

        <div className="space-y-2">
          {mainMenus.map((menu) => {
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
                    menus={resultSubMenus}
                    selected={selectedResultMenu}
                    onSelect={setSelectedResultMenu}
                  />
                )}
                {expanded && menu.key === "AI" && (
                  <SubMenuList
                    menus={aiSubMenus}
                    selected={selectedAiMenu}
                    onSelect={setSelectedAiMenu}
                  />
                )}
                {expanded && menu.key === "TREATMENT" && (
                  <SubMenuList
                    menus={treatmentSubMenus}
                    selected={selectedTreatmentMenu}
                    onSelect={setSelectedTreatmentMenu}
                  />
                )}
                {expanded && menu.key === "PRESCRIPTION" && (
                  <SubMenuList
                    menus={prescriptionSubMenus}
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
      <main className="min-w-0 flex-1 p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                D
              </span>

              <span className="text-xs font-semibold text-emerald-700">
                상세 화면
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-bold text-slate-800">
              {getDetailTitle(
                selectedMainMenu,
                selectedResultMenu,
                selectedAiMenu,
                selectedTreatmentMenu,
                selectedPrescriptionMenu
              )}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {selectedCase.patient_name} ·{" "}
              {selectedCase.patient_code} ·{" "}
              {selectedCase.case_code}
            </p>
          </div>

          <span className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-semibold text-emerald-700">
            {getStageLabel(
              selectedCase.current_stage
            )}
          </span>
        </div>

        {selectedMainMenu === "PRESCRIPTION" &&
        selectedPrescriptionMenu === "PRESCRIPTION_LIST" ? (
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)] items-start gap-4">
            <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
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

              <div className="mt-4 space-y-3">
                {casePrescriptions.map((prescription) => (
                  <article
                    key={prescription.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-800">
                          {prescription.regimen_detail.regimen_name}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {prescription.regimen_detail.regimen_code} · Cycle {prescription.cycle_number} · {prescription.phase_label}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
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
                        <p className="text-slate-400">Safety Check</p>
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
                          <div
                            key={item.id}
                            className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2 border-t border-slate-100 px-3 py-2 text-xs first:border-t-0"
                          >
                            <span className="font-semibold text-slate-700">
                              {item.drug_name}
                              {item.ingredient_name && (
                                <span className="ml-1 font-normal text-slate-400">
                                  {item.ingredient_name}
                                </span>
                              )}
                            </span>
                            <span className="text-slate-500">
                              계산 {item.calculated_dose ?? "-"}{item.unit ?? ""} · 최종 {item.final_dose ?? "-"}{item.unit ?? ""}
                            </span>
                            <span className="text-slate-500">
                              {item.route_label || "-"} · {item.frequency || "-"}
                            </span>
                            <span className="text-right text-slate-400">
                              투여일 {item.administration_day || "-"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="mt-3 text-[11px] text-slate-400">
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

            <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold text-sky-600">
                확정 치료결정 기반
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-800">
                새 처방 생성
              </h2>

              <div className="mt-4 space-y-4">
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
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-300"
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
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-300"
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
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-300"
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
                className="mt-5 w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {casePrescriptionWorking
                  ? "생성 중..."
                  : "처방 DRAFT 생성"}
              </button>

              <p className="mt-3 text-[11px] leading-5 text-slate-400">
                생성 조건은 기존 처방 backend 검증을 따릅니다. Safety Check는 이번 단계에서 실행하지 않습니다.
              </p>
            </section>
          </div>
        ) : selectedMainMenu === "TREATMENT" &&
        selectedTreatmentMenu === "FINAL_PLAN" ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
              <div>
                <p className="text-xs font-semibold text-emerald-600">
                  의료진 치료 결정 DRAFT
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-800">
                  의료진 최종 치료계획
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  현재 Case의 치료계획을 작성하고 DRAFT로 저장합니다.
                </p>
              </div>

              {!caseTreatmentDecision && (
                <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  아직 등록된 최종 치료계획이 없습니다. 새 DRAFT를 작성할 수 있습니다.
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

              <div className="mt-4 grid grid-cols-2 gap-4">
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
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-300"
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
                    선택 Regimen
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
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-300"
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

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid grid-cols-2 gap-4">
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
                    rows={3}
                    placeholder="치료 계획을 입력하세요."
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-300"
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
                    rows={3}
                    placeholder="표적치료 계획을 입력하세요."
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-300"
                  />
                </label>
              </div>

              <label className="mt-4 block">
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
                  rows={3}
                  placeholder="치료 결정 근거를 입력하세요."
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-300"
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

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCaseTreatmentDraftSave}
                  disabled={
                    caseTreatmentSaving ||
                    caseTreatmentConfirming ||
                    caseTreatmentConfirmed
                  }
                  className="rounded-xl border border-emerald-200 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {caseTreatmentSaving ? "저장 중..." : "DRAFT 저장"}
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
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {caseTreatmentConfirming
                    ? "확정 중..."
                    : caseTreatmentConfirmed
                      ? "최종 확정 완료"
                      : "최종 확정"}
                </button>
              </div>
            </section>
          </div>
        ) : selectedMainMenu === "TREATMENT" &&
        selectedTreatmentMenu === "AI_RECOMMENDATION" ? (
        treatmentAnalysis ? (
          <div className="space-y-4">
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
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {treatmentAnalysis.overall_opinion || "-"}
                  </p>
                </div>
                <div className="rounded-xl bg-sky-50/60 px-4 py-4">
                  <p className="text-xs font-semibold text-sky-700">
                    추천 치료 계획
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
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
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {treatmentAnalysis.targeted_therapy_recommendation ??
                    "표시할 표적치료 추천이 없습니다."}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-bold text-slate-800">
                  추천 근거
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
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
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-100 bg-white px-6 py-16 text-center text-sm text-slate-400 shadow-sm">
            AI 치료 추천 결과가 없습니다.
          </div>
        )
        ) : selectedMainMenu === "TREATMENT" &&
        selectedTreatmentMenu === "REGIMEN" ? (
        <div>
          <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-800">
              확정된 임상 결과와 TreatmentRule이 일치하는 Regimen 후보입니다.
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
                          className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
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
                    <span className="text-right font-medium text-slate-600">
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
              현재 확정된 임상 결과와 일치하는 Regimen 후보가 없습니다.
            </div>
          )}
        </div>
        ) : selectedMainMenu === "AI" &&
        selectedAiMenu === "STAGING" ? (
        <div className="space-y-4">
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
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                >
                  <span className="font-bold text-emerald-700">{label}</span>
                  <span className="text-xs text-slate-400">
                    AI {aiValue ?? "-"}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">→</span>
                  <span className="text-xs text-slate-400">
                    의료진 {clinicalValue ?? "-"}
                  </span>
                  <span className="ml-auto rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
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
        ) : selectedMainMenu === "AI" &&
        selectedAiMenu === "GENE" ? (
        <Pdl1AiPanel
          result={latestPdl1Result}
          geneAnalysisResult={geneAnalysisResult}
          geneClinicalResult={geneClinicalResult}
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
        </main>
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
      <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <div>
          <p className="text-base font-bold text-slate-800">
            유전자 분석
          </p>
          <p className="mt-1 text-xs text-slate-400">
            AI 예측과 의료진 확정 결과를 함께 표시합니다.
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
          <div className="grid grid-cols-[0.8fr_1fr_0.7fr_1fr] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
            <span>유전자</span>
            <span>AI 예측</span>
            <span>확률</span>
            <span>의료진 판정</span>
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
                  {gene?.predicted_status_label ?? "AI 데이터 없음"}
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
              AI 데이터 및 의료진 확정 결과가 없습니다.
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold text-slate-400">
              의료진 종합 해석
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {geneClinicalResult?.result_detail.gene?.interpretation ??
                "확정 결과 없음"}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold text-slate-400">
              추가 검사 권고
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
            <p className="text-base font-bold text-slate-800">
              PD-L1 분석
            </p>
            <p className="mt-1 text-xs text-slate-400">
              AI 예측 구간과 의료진 확정 TPS를 구분해 표시합니다.
            </p>
          </div>
          {result && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {result.status_label}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-xs font-medium text-slate-500">
              AI 예측 TPS 구간
            </p>
            <p className="mt-2 text-xl font-bold text-emerald-700">
              {pdl1?.predicted_tps_range_label ?? "AI 데이터 없음"}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">
              AI 신뢰도
            </p>
            <p className="mt-2 text-xl font-bold text-slate-700">
              {confidence !== null ? `${confidence.toFixed(2)}%` : "-"}
            </p>
          </div>
          <div className="rounded-xl bg-sky-50 p-4">
            <p className="text-xs font-medium text-slate-500">
              의료진 확정 TPS
            </p>
            <p className="mt-2 text-xl font-bold text-sky-700">
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
            <span className="text-slate-400">의료진 해석</span>
            <span className="text-right font-medium text-slate-600">
              {clinicalPdl1?.interpretation ?? "확정 결과 없음"}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">판독 소견</span>
            <span className="text-right font-medium text-slate-600">
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
          AI 결과는 TPS 예측 구간이며 의료진 결과는 실제 TPS 값입니다.
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
