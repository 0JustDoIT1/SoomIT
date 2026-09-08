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

  const [hoveredMainMenu, setHoveredMainMenu] =
    useState<MainMenu | null>(null);

  const [selectedResultMenu, setSelectedResultMenu] =
  useState<ResultSubMenu>("XRAY");

  const [hoveredResultMenu, setHoveredResultMenu] =
  useState<ResultSubMenu | null>(null);

  const [selectedAiMenu, setSelectedAiMenu] =
  useState<AiSubMenu>("CT");

  const [hoveredAiMenu, setHoveredAiMenu] =
  useState<AiSubMenu | null>(null);

  const [pdl1Results, setPdl1Results] =
  useState<Pdl1Result[]>([]);

  const [selectedTreatmentMenu, setSelectedTreatmentMenu] =
  useState<TreatmentSubMenu>("AI_RECOMMENDATION");

  const [hoveredTreatmentMenu, setHoveredTreatmentMenu] =
  useState<TreatmentSubMenu | null>(null);

  const [selectedPrescriptionMenu, setSelectedPrescriptionMenu] =
  useState<PrescriptionSubMenu>("PRESCRIPTION_LIST");

  const [hoveredPrescriptionMenu, setHoveredPrescriptionMenu] =
  useState<PrescriptionSubMenu | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

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

  const visibleMainMenu =
    hoveredMainMenu ?? selectedMainMenu;

  const handleCaseSelect = (id: string) => {
    if (id === caseId) {
      return;
    }

    router.push(`/respiratory/cases/${id}`);
  };

  const handleMainMenuClick = (menu: MainMenu) => {
    setSelectedMainMenu(menu);
    setHoveredMainMenu(null);
  };

  const latestPdl1Result =
    pdl1Results.length > 0
        ? pdl1Results[0]
        : null;

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
        style={{ width: "160px" }}
        className="shrink-0 border-r border-slate-200 bg-white px-3 py-5"
        onMouseLeave={() =>
          setHoveredMainMenu(null)
        }
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

            return (
              <button
                key={menu.key}
                type="button"
                onMouseEnter={() =>
                  setHoveredMainMenu(menu.key)
                }
                onClick={() =>
                  handleMainMenuClick(menu.key)
                }
                className={`w-full rounded-xl px-4 py-4 text-left transition ${
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-emerald-50/60"
                }`}
              >
                <p className="text-sm font-bold">
                  {menu.label}
                </p>

                <p className="mt-1 text-[11px] text-slate-400">
                  {menu.description}
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      {/* C. 세부 항목 */}
      <aside
        style={{ width: "165px" }}
        className="shrink-0 border-r border-slate-200 bg-white/90 px-3 py-5 backdrop-blur-sm"
      >

        <div className="mb-4 flex items-center gap-2 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
            C
          </span>

          <h2 className="text-sm font-bold text-slate-700">
            {getMainMenuLabel(
              visibleMainMenu
            )}
          </h2>
        </div>

        {visibleMainMenu === "RESULTS" && (
          <div className="space-y-2">
            {resultSubMenus.map((menu) => {
                const active =
                    hoveredResultMenu !== null
                    ? hoveredResultMenu === menu.key
                    : selectedResultMenu === menu.key;

                return (
                    <button
                    key={menu.key}
                    type="button"
                    onMouseEnter={() =>
                        setHoveredResultMenu(menu.key)
                    }
                    onMouseLeave={() =>
                        setHoveredResultMenu(null)
                    }
                    onClick={() =>
                        setSelectedResultMenu(menu.key)
                    }
                    className={getSubMenuClass(active)}
                    >
                    {menu.label}
                    </button>
                );
              })}
          </div>
        )}

        {visibleMainMenu === "AI" && (
          <div className="space-y-2">
            {aiSubMenus.map((menu) => {
                const active =
                    hoveredAiMenu !== null
                    ? hoveredAiMenu === menu.key
                    : selectedAiMenu === menu.key;

                return (
                    <button
                    key={menu.key}
                    type="button"
                    onMouseEnter={() =>
                        setHoveredAiMenu(menu.key)
                    }
                    onMouseLeave={() =>
                        setHoveredAiMenu(null)
                    }
                    onClick={() =>
                        setSelectedAiMenu(menu.key)
                    }
                    className={getSubMenuClass(active)}
                    >
                    {menu.label}
                    </button>
                );
              })}
          </div>
        )}

        {visibleMainMenu === "TREATMENT" && (
          <div className="space-y-2">
            {treatmentSubMenus.map((menu) => {
                const active =
                    hoveredTreatmentMenu !== null
                    ? hoveredTreatmentMenu === menu.key
                    : selectedTreatmentMenu === menu.key;

                return (
                    <button
                    key={menu.key}
                    type="button"
                    onMouseEnter={() =>
                        setHoveredTreatmentMenu(menu.key)
                    }
                    onMouseLeave={() =>
                        setHoveredTreatmentMenu(null)
                    }
                    onClick={() =>
                        setSelectedTreatmentMenu(menu.key)
                    }
                    className={getSubMenuClass(active)}
                    >
                    {menu.label}
                    </button>
                );
              })}
          </div>
        )}

        {visibleMainMenu === "PRESCRIPTION" && (
          <div className="space-y-2">
            {prescriptionSubMenus.map((menu) => {
              const active =
                selectedPrescriptionMenu ===
                menu.key;

              return (
                <button
                  key={menu.key}
                  type="button"
                  onClick={() =>
                    setSelectedPrescriptionMenu(
                      menu.key
                    )
                  }
                  className={getSubMenuClass(
                    active
                  )}
                >
                  {menu.label}
                </button>
              );
            })}
          </div>
        )}
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

        {selectedMainMenu === "AI" &&
        selectedAiMenu === "GENE" ? (
        <Pdl1AiPanel result={latestPdl1Result} />
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
}: {
  result: Pdl1Result | null;
}) {
  if (!result) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm">
        <div className="flex min-h-[520px] items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-bold text-slate-700">
              유전자 & PD-L1 AI 분석
            </p>

            <p className="mt-3 text-sm text-slate-400">
              저장된 PD-L1 AI 분석 결과가 없습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const pdl1 = result.result_detail?.pdl1;

  if (!pdl1) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-500">
          PD-L1 결과 상세 정보를 확인할 수 없습니다.
        </p>
      </div>
    );
  }

  const confidence =
    Number(pdl1.confidence) * 100;

  const class0 =
    pdl1.probabilities.class_0 * 100;

  const class1 =
    pdl1.probabilities.class_1 * 100;

  const class2 =
    pdl1.probabilities.class_2 * 100;

  return (
    <div className="space-y-5">
      {/* PD-L1 주요 결과 */}
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-slate-800">
              PD-L1 AI 분석
            </p>

            <p className="mt-1 text-xs text-slate-400">
              TPS 구간 분류 모델
            </p>
          </div>

          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            {result.status_label}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-emerald-50 p-5">
            <p className="text-xs font-medium text-slate-500">
              예측 TPS 구간
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-700">
              {pdl1.predicted_tps_range_label}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-5">
            <p className="text-xs font-medium text-slate-500">
              AI 신뢰도
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-800">
              {confidence.toFixed(2)}%
            </p>
          </div>
        </div>
      </section>

      {/* 클래스별 확률 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-slate-800">
          클래스별 예측 확률
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <ProbabilityCard
            label="<1%"
            value={class0}
          />

          <ProbabilityCard
            label="1–49%"
            value={class1}
          />

          <ProbabilityCard
            label="≥50%"
            value={class2}
          />
        </div>
      </section>

      {/* 모델 정보 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-slate-800">
          분석 정보
        </p>

        <div className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
          <span className="text-slate-400">
            모델
          </span>

          <span className="font-medium text-slate-700">
            {result.model_name}
          </span>

          <span className="text-slate-400">
            모델 버전
          </span>

          <span className="font-medium text-slate-700">
            {result.model_version_name}
          </span>

          <span className="text-slate-400">
            분석 상태
          </span>

          <span className="font-medium text-slate-700">
            {result.status_label}
          </span>
        </div>
      </section>

      {/* 주의 */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-5 py-4">
        <p className="text-xs leading-5 text-amber-700">
          PD-L1 AI 모델은 정확한 TPS 수치를 예측하지 않고
          &lt;1%, 1–49%, ≥50% 구간을 분류합니다.
          AI 신뢰도는 TPS 값이 아닙니다.
        </p>
      </div>

      {/* 유전자 */}
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-4">
        <p className="text-xs text-slate-400">
          유전자 AI 분석 결과는 담당 모델 API 연동 후 이 영역에 함께 표시합니다.
        </p>
      </div>
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