"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Patient = {
  id: string;
  patient_code: string;
  name: string;
  created_at: string;
};

type ExaminationFlow = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  current_stage: string;
  case_status: string;
  created_at: string;
  updated_at: string;
};

type Appointment = {
  id: string;
  patient_code: string;
  patient_name: string;
  case_code: string | null;
  doctor_name: string | null;
  scheduled_at: string;
  appointment_status: string;
  created_by_type: string;
  created_at: string;
};

type DashboardFilter =
  | "REQUEST_ALL"
  | "CONSULTATION_REQUEST"
  | "EXAM_REQUEST"
  | "TODAY_CONFIRMED"
  | "CHANGE_REQUEST";

type PatientFlowItem = {
  patient: Patient;
  appointment: Appointment;
  examination: ExaminationFlow | null;
};


function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-11 items-center gap-2 whitespace-nowrap text-sm transition ${
        active
          ? "font-semibold text-slate-900"
          : "font-medium text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}

      <span
        className={`text-xs ${
          active ? "text-pink-500" : "text-slate-400"
        }`}
      >
        {count}
      </span>

      {active && (
        <span className="absolute bottom-0 left-0 h-[2px] w-full bg-pink-400" />
      )}
    </button>
  );
}


export default function CoordinatorDashboardPage() {
  const router = useRouter();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [examinations, setExaminations] = useState<ExaminationFlow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [selectedFilter, setSelectedFilter] =
   useState<DashboardFilter>("REQUEST_ALL");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError("");

        const [
          patientsResponse,
          examinationsResponse,
          appointmentsResponse,
        ] = await Promise.all([
          fetch("http://127.0.0.1:8000/api/patients/"),
          fetch("http://127.0.0.1:8000/api/cases/"),
          fetch("http://127.0.0.1:8000/api/appointments/"),
        ]);

        if (
          !patientsResponse.ok ||
          !examinationsResponse.ok ||
          !appointmentsResponse.ok
        ) {
          throw new Error("대시보드 정보를 불러오지 못했습니다.");
        }

        const [patientData, examinationData, appointmentData] =
          await Promise.all([
            patientsResponse.json(),
            examinationsResponse.json(),
            appointmentsResponse.json(),
          ]);

        setPatients(patientData);
        setExaminations(examinationData);
        setAppointments(appointmentData);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "대시보드 조회 중 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);


  

  /*
   * 원무과 대시보드는 전체 환자가 아니라
   * 예약이 존재하는 환자를 기준으로 보여줍니다.
   */
  const patientFlows = useMemo<PatientFlowItem[]>(() => {
    const result: PatientFlowItem[] = [];

    for (const appointment of appointments) {
      const patient = patients.find(
        (item) => item.patient_code === appointment.patient_code
      );

      /*
       * 예약에 연결된 환자를 현재 환자 목록에서 찾지 못한 경우
       * 화면에는 표시하지 않습니다.
       */
      if (!patient) {
        continue;
      }

      const patientExaminations = examinations
        .filter(
          (examination) =>
            examination.patient_code === patient.patient_code
        )
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() -
            new Date(a.updated_at).getTime()
        );

      result.push({
        patient,
        appointment,
        examination: patientExaminations[0] ?? null,
      });
    }

    return result.sort(
      (a, b) =>
        new Date(a.appointment.scheduled_at).getTime() -
        new Date(b.appointment.scheduled_at).getTime()
    );
  }, [patients, appointments, examinations]);

  const filterCounts = useMemo(() => {
    const consultationRequests = patientFlows.filter(
      (item) =>
        item.appointment.appointment_status === "REQUESTED" &&
        !item.examination
    );

    const examRequests = patientFlows.filter(
      (item) =>
        item.appointment.appointment_status === "REQUESTED" &&
        Boolean(item.examination)
    );

    const todayConfirmed = patientFlows.filter(
      (item) =>
        item.appointment.appointment_status === "CONFIRMED" &&
        isToday(item.appointment.scheduled_at)
    );

    return {
      REQUEST_ALL:
        consultationRequests.length + examRequests.length,

      CONSULTATION_REQUEST: consultationRequests.length,

      EXAM_REQUEST: examRequests.length,

      TODAY_CONFIRMED: todayConfirmed.length,

      CHANGE_REQUEST: 0,
    };
  }, [patientFlows]);

  const filteredFlows = useMemo(() => {
    switch (selectedFilter) {
      case "REQUEST_ALL":
        return patientFlows.filter(
          (item) =>
            item.appointment.appointment_status === "REQUESTED"
        );

      case "CONSULTATION_REQUEST":
        return patientFlows.filter(
          (item) =>
            item.appointment.appointment_status === "REQUESTED" &&
            !item.examination
        );

      case "EXAM_REQUEST":
        return patientFlows.filter(
          (item) =>
            item.appointment.appointment_status === "REQUESTED" &&
            Boolean(item.examination)
        );

      case "TODAY_CONFIRMED":
        return patientFlows.filter(
          (item) =>
            item.appointment.appointment_status === "CONFIRMED" &&
            isToday(item.appointment.scheduled_at)
        );

      case "CHANGE_REQUEST":
        return [];

      default:
        return patientFlows.filter(
          (item) =>
            item.appointment.appointment_status === "REQUESTED"
        );
    }
  }, [patientFlows, selectedFilter]);

  if (loading) {
    return (
      <div className="border border-slate-200 bg-white px-6 py-10 text-sm text-slate-500">
        대시보드 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-100 bg-red-50 px-6 py-5 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* 페이지 제목 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          대시보드
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          오늘 예정된 상담과 검사 흐름을 환자별로 확인합니다.
        </p>
      </div>

      {/* 상단 업무 필터 */}
      <div className="border-b border-slate-200">
        <div className="flex min-w-max items-center gap-3 overflow-x-auto">
          <span className="mr-1 text-sm font-bold text-slate-400">
            예약 요청 :
          </span>

          <FilterButton
            label="전체"
            count={filterCounts.REQUEST_ALL}
            active={selectedFilter === "REQUEST_ALL"}
            onClick={() => setSelectedFilter("REQUEST_ALL")}
          />

          <FilterButton
            label="상담 예약"
            count={filterCounts.CONSULTATION_REQUEST}
            active={selectedFilter === "CONSULTATION_REQUEST"}
            onClick={() =>
              setSelectedFilter("CONSULTATION_REQUEST")
            }
          />

          <FilterButton
            label="검사 예약"
            count={filterCounts.EXAM_REQUEST}
            active={selectedFilter === "EXAM_REQUEST"}
            onClick={() =>
              setSelectedFilter("EXAM_REQUEST")
            }
          />

          <div className="mx-5 h-5 w-px bg-slate-200" />

          <FilterButton
            label="오늘 예약"
            count={filterCounts.TODAY_CONFIRMED}
            active={selectedFilter === "TODAY_CONFIRMED"}
            onClick={() =>
              setSelectedFilter("TODAY_CONFIRMED")
            }
          />

          <div className="mx-5 h-5 w-px bg-slate-200" />

          <FilterButton
            label="일정 변경"
            count={filterCounts.CHANGE_REQUEST}
            active={selectedFilter === "CHANGE_REQUEST"}
            onClick={() =>
              setSelectedFilter("CHANGE_REQUEST")
            }
          />
        </div>
      </div>

      {/* 환자 흐름 */}
      <section className="mt-7">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              오늘 환자 흐름
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              예약부터 상담, 검사 진행까지 한 번에 확인할 수 있습니다.
            </p>
          </div>

          <span className="text-xs text-slate-400">
            {filteredFlows.length}명
          </span>
        </div>
        



        <div className="border-y border-slate-200 bg-white">
          {filteredFlows.map((item) => (
            <PatientFlowRow
              key={item.appointment.id}
              item={item}
              onOpenAppointment={() =>
                router.push("/coordinator/appointments")
              }
              onOpenPatient={() =>
                router.push("/coordinator/patients")
              }
            />
          ))}

          {filteredFlows.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-400">
                해당 조건의 예약 환자가 없습니다.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PatientFlowRow({
  item,
  onOpenAppointment,
  onOpenPatient,
}: {
  item: PatientFlowItem;
  onOpenAppointment: () => void;
  onOpenPatient: () => void;
}) {
  const { patient, appointment, examination } = item;

  const steps = getFlowSteps(
    appointment,
    examination
  );

  return (
    <div className="group relative border-b border-slate-100 px-5 py-5 last:border-b-0 transition hover:z-10 hover:bg-pink-50/20">
      <div className="grid grid-cols-[190px_145px_170px_minmax(420px,1fr)_130px] items-center gap-5">
        {/* 환자 */}
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-slate-800">
            {patient.name}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {patient.patient_code}
          </p>
        </div>

        {/* 예약 */}
        <div>
          <p className="text-sm font-semibold text-slate-700">
            {formatAppointmentDate(
              appointment.scheduled_at
            )}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {getAppointmentStatusLabel(
              appointment.appointment_status
            )}
          </p>
        </div>

        {/* 담당 의사 */}
        <div>
          <p className="text-sm font-semibold text-slate-700">
            {appointment.doctor_name ??
              "담당 의사 미정"}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            호흡기내과
          </p>
        </div>

        {/* 진행 흐름 */}
        <FlowStepper steps={steps} />

        {/* 현재 상태 */}
        <div className="flex justify-end">
          <CurrentStatusBadge
            appointment={appointment}
            examination={examination}
          />
        </div>
      </div>

      {/* 행 Hover 버튼 */}
      <div className="pointer-events-none absolute right-5 top-1/2 flex -translate-y-1/2 translate-x-2 items-center gap-2 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100">
        <button
          type="button"
          onClick={onOpenAppointment}
          className="rounded-lg border border-pink-200 bg-white px-3 py-2 text-xs font-semibold text-pink-500 shadow-sm transition hover:bg-pink-50"
        >
          예약 관리
        </button>

        {examination && (
          <button
            type="button"
            onClick={onOpenAppointment}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            검사 일정 잡기
          </button>
        )}

        <button
          type="button"
          onClick={onOpenPatient}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          상세보기
        </button>
      </div>
    </div>
  );
}

function FlowStepper({
  steps,
}: {
  steps: {
    label: string;
    state: "DONE" | "CURRENT" | "WAITING";
    description?: string;
  }[];
}) {
  return (
    <div className="flex min-w-0 items-start">
      {steps.map((step, index) => {
        const done = step.state === "DONE";
        const current =
          step.state === "CURRENT";

        return (
          <div
            key={step.label}
            className="group/step relative flex flex-1 items-start"
          >
            <div className="flex w-full flex-col items-center">
              <div className="flex w-full items-center">
                {index > 0 && (
                  <div
                    className={`h-px flex-1 ${
                      done || current
                        ? "bg-pink-300"
                        : "bg-slate-200"
                    }`}
                  />
                )}

                <div
                  className={`relative flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? "border-pink-400 bg-pink-400"
                      : current
                      ? "border-pink-400 bg-white"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {done && (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}

                  {current && (
                    <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />
                  )}
                </div>

                {index < steps.length - 1 && (
                  <div
                    className={`h-px flex-1 ${
                      done
                        ? "bg-pink-300"
                        : "bg-slate-200"
                    }`}
                  />
                )}
              </div>

              <span
                className={`mt-2 whitespace-nowrap text-[11px] ${
                  current
                    ? "font-semibold text-pink-500"
                    : done
                    ? "font-medium text-slate-600"
                    : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* 단계 Hover */}
            {step.description && (
              <div className="pointer-events-none absolute bottom-[48px] left-1/2 z-30 hidden w-[180px] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-lg group-hover/step:block">
                <p className="text-xs font-semibold text-slate-700">
                  {step.label}
                </p>

                <p className="mt-1 text-[11px] leading-4 text-slate-400">
                  {step.description}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CurrentStatusBadge({
  appointment,
  examination,
}: {
  appointment: Appointment;
  examination: ExaminationFlow | null;
}) {
  if (
    appointment.appointment_status ===
    "REQUESTED"
  ) {
    return (
      <span className="rounded-full bg-pink-50 px-3 py-1.5 text-xs font-semibold text-pink-500">
        승인 대기
      </span>
    );
  }

  if (
    appointment.appointment_status ===
    "CANCELLED"
  ) {
    return (
      <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
        예약 취소
      </span>
    );
  }

  if (!examination) {
    return (
      <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-600">
        상담 예정
      </span>
    );
  }

  return (
    <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600">
      {getStageLabel(
        examination.current_stage
      )}
    </span>
  );
}

function getFlowSteps(
  appointment: Appointment,
  examination: ExaminationFlow | null
) {
  const currentStage =
    examination?.current_stage ?? "CONSULTATION";

  const stages = [
    {
      key: "CONSULTATION",
      label: "상담",
    },
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
      key: "GENE",
      label: "유전자 검사",
    },
    {
      key: "TREATMENT",
      label: "치료/처방",
    },
  ];

  const currentIndex =
    getClinicalStageIndex(currentStage);

  return stages.map((stage, index) => {
    let state:
      | "DONE"
      | "CURRENT"
      | "WAITING" = "WAITING";

    if (index < currentIndex) {
      state = "DONE";
    }

    if (index === currentIndex) {
      state = "CURRENT";
    }

    return {
      label: stage.label,
      state,
      description:
        state === "CURRENT"
          ? getClinicalStageDescription(
              stage.key,
              appointment,
              examination
            )
          : undefined,
    };
  });
}


function getClinicalStageIndex(
  stage: string
) {
  if (stage === "CONSULTATION") return 0;
  if (stage === "XRAY") return 1;
  if (stage === "CT") return 2;
  if (stage === "PATHOLOGY") return 3;
  if (stage === "GENE") return 4;

  if (
    stage === "STAGING" ||
    stage === "TREATMENT" ||
    stage === "PRESCRIPTION"
  ) {
    return 5;
  }

  return 0;
}

function getClinicalStageDescription(
  stage: string,
  appointment: Appointment,
  examination: ExaminationFlow | null
) {
  if (stage === "CONSULTATION") {
    return appointment.doctor_name
      ? `${appointment.doctor_name} 상담 단계`
      : "호흡기내과 상담 단계";
  }

  if (stage === "XRAY") {
    return "흉부 X-ray 검사 단계";
  }

  if (stage === "CT") {
    return "CT 검사 단계";
  }

  if (stage === "PATHOLOGY") {
    return "병리 검사 단계";
  }

  if (stage === "GENE") {
    return "유전자 검사 단계";
  }

  if (stage === "TREATMENT") {
    return "치료 및 처방 결정 단계";
  }

  return examination
    ? getStageLabel(
        examination.current_stage
      )
    : "상담 단계";
}

function getStageLabel(stage: string) {
  if (stage === "XRAY") {
    return "X-ray";
  }

  if (stage === "CT") {
    return "CT";
  }

  if (stage === "PATHOLOGY") {
    return "병리 검사";
  }

  if (stage === "STAGING") {
    return "TNM 병기";
  }

  if (stage === "GENE") {
    return "유전자 검사";
  }

  if (stage === "TREATMENT") {
    return "치료 결정";
  }

  if (stage === "PRESCRIPTION") {
    return "처방";
  }

  return "검사 진행";
}

function getAppointmentStatusLabel(
  status: string
) {
  if (status === "REQUESTED") {
    return "예약 신청";
  }

  if (status === "CONFIRMED") {
    return "예약 확정";
  }

  if (status === "CANCELLED") {
    return "예약 취소";
  }

  return status;
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() ===
      today.getFullYear() &&
    date.getMonth() ===
      today.getMonth() &&
    date.getDate() ===
      today.getDate()
  );
}

function formatAppointmentDate(
  value: string
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const time = date.toLocaleTimeString(
    "ko-KR",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  );

  if (isToday(value)) {
    return `오늘 ${time}`;
  }

  const day =
    date.toLocaleDateString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
    });

  return `${day} ${time}`;
}