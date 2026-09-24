import { useMemo, useState } from "react";

import {
  deriveCurrentActions,
  type CurrentAction,
} from "../_lib/derive-current-actions";

const STAGES = [
  "XRAY",
  "CT",
  "PET_CT_TNM",
  "PATHOLOGY_GENE",
  "PDL1",
  "TREATMENT",
  "PRESCRIPTION",
] as const;

type Stage = (typeof STAGES)[number];

const STAGE_LABELS: Record<Stage, string> = {
  XRAY: "흉부 X-ray",
  CT: "흉부 CT",
  PET_CT_TNM: "PET-CT / TNM",
  PATHOLOGY_GENE: "조직·유전자",
  PDL1: "PD-L1",
  TREATMENT: "치료결정",
  PRESCRIPTION: "처방",
};

export type DashboardCase = {
  id: string;
  case_code: string;
  patient_name: string;
  patient_code: string;
  current_stage: string;
  case_status: string;
};

type ClinicalResult = {
  id?: string;
  workflow_stage: string;
  result_status?: string;
  result_status_label?: string;
  result_detail?: unknown;
  result_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AiResult = {
  id?: string;
  analysis_type: string;
  status?: string;
  status_label?: string;
};

type Order = {
  id: string;
  order_type: string;
  order_type_label?: string;
  status: string;
  scheduled_at?: string | null;
  appointment_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DashboardCaseSnapshot = {
  clinicalResults: ClinicalResult[];
  aiResults: AiResult[];
  orders: Order[];
};

export type DashboardConsultation = {
  id: string;
  case_id: string;
  case_code: string;
  patient_name: string;
  status: string;
  priority: string;
  question: string;
};

export type DashboardNotification = {
  id: string;
  title: string;
  message: string;
  case_id: string | null;
  case_code: string | null;
  created_at: string;
  read_at: string | null;
};

export type DashboardPatientAppointment = {
  id: string;
  patient_code: string;
  patient_name: string;
  case_code: string | null;
  scheduled_at: string;
  appointment_status: "REQUESTED" | "CONFIRMED";
  appointment_status_label: string;
  created_by_type: string;
};

export type DashboardQueueItem = {
  id: string;
  caseId: string;
  patient: string;
  stage: string;
  status: string;
  action: string;
};

type WorkGroup = {
  key: string;
  label: string;
  count: number;
  caseId: string;
  detail: string;
};

export type DashboardStageSummary = {
  stage: string;
  label: string;
  total: number;
  progressing: number;
  resultWaiting: number;
  confirmationWaiting: number;
  confirmed: number;
};

type JourneyState = "confirmed" | "active" | "waiting";

type JourneyItem = {
  stage: Stage;
  label: string;
  state: JourneyState;
  description: string;
};

/* -------------------------------------------------------------------------- */
/* Review Queue                                                               */
/* -------------------------------------------------------------------------- */

export function buildDashboardReviewQueue(
  cases: DashboardCase[],
  snapshots: Record<string, DashboardCaseSnapshot>,
  consultations: DashboardConsultation[],
) {
  const rows: DashboardQueueItem[] = [];

  for (const caseItem of cases) {
    const snapshot = snapshots[caseItem.id];

    if (!snapshot || caseItem.case_status !== "ACTIVE") {
      continue;
    }

    const stageClinical = snapshot.clinicalResults.find(
      (result) => result.workflow_stage === caseItem.current_stage,
    );

    const stageAi = snapshot.aiResults.find(
      (result) =>
        result.analysis_type === `${caseItem.current_stage}_ANALYSIS` &&
        result.status === "SUCCEEDED",
    );

    const activeOrder = snapshot.orders.find(
      (order) =>
        order.order_type === caseItem.current_stage &&
        ["ORDERED", "SCHEDULED"].includes(order.status),
    );

    const base = {
      caseId: caseItem.id,
      patient: caseItem.patient_name || caseItem.patient_code,
      stage:
        STAGE_LABELS[caseItem.current_stage as Stage] ??
        caseItem.current_stage,
    };

    if (stageClinical?.result_status === "DRAFT") {
      const submitted = ["PATHOLOGY_GENE", "PDL1"].includes(
        caseItem.current_stage,
      );

      rows.push({
        ...base,
        id: `clinical-${caseItem.id}`,
        status: submitted ? "제출 완료" : "결과 저장",
        action: submitted ? "호흡기내과 확인 필요" : "확정 필요",
      });

      continue;
    }

    if (
      stageAi &&
      stageClinical?.result_status !== "CONFIRMED"
    ) {
      rows.push({
        ...base,
        id: `ai-${caseItem.id}`,
        status: "AI 분석 완료",
        action: "결과 검토 필요",
      });

      continue;
    }

    if (activeOrder) {
      rows.push({
        ...base,
        id: `order-${caseItem.id}`,
        status:
          activeOrder.status === "SCHEDULED"
            ? "예약됨"
            : "오더 요청됨",
        action: "오더 확인",
      });
    }
  }

  consultations
    .filter((item) =>
      ["REQUESTED", "ACKNOWLEDGED"].includes(item.status),
    )
    .forEach((item) => {
      rows.push({
        id: `consultation-${item.id}`,
        caseId: item.case_id,
        patient: item.patient_name,
        stage: "협진",
        status:
          item.priority === "URGENT"
            ? "긴급 요청"
            : "응답 대기",
        action: "협진 응답",
      });
    });

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Work Groups                                                                */
/* -------------------------------------------------------------------------- */

export function buildDashboardWorkGroups(
  cases: DashboardCase[],
  snapshots: Record<string, DashboardCaseSnapshot>,
  consultations: DashboardConsultation[],
) {
  const items: Array<{
    kind: string;
    label: string;
    caseId: string;
    detail: string;
  }> = [];

  for (const caseItem of cases) {
    const snapshot = snapshots[caseItem.id];

    if (!snapshot) {
      continue;
    }

    deriveCurrentActions(
      caseItem,
      snapshot.clinicalResults,
      snapshot.aiResults,
      [],
      snapshot.orders,
    ).forEach((action) => {
      items.push({
        ...classifyAction(action),
        caseId: caseItem.id,
        detail: action.status,
      });
    });
  }

  consultations
    .filter((item) =>
      ["REQUESTED", "ACKNOWLEDGED"].includes(item.status),
    )
    .forEach((item) => {
      items.push({
        kind: "CONSULTATION",
        label: "협진 응답",
        caseId: item.case_id,
        detail:
          item.priority === "URGENT"
            ? "긴급"
            : "응답 대기",
      });
    });

  const groups = new Map<string, WorkGroup>();

  items.forEach((item) => {
    const current = groups.get(item.kind);

    groups.set(
      item.kind,
      current
        ? {
            ...current,
            count: current.count + 1,
          }
        : {
            key: item.kind,
            label: item.label,
            count: 1,
            caseId: item.caseId,
            detail: item.detail,
          },
    );
  });

  return [...groups.values()];
}

/* -------------------------------------------------------------------------- */
/* Stage Summary                                                              */
/* -------------------------------------------------------------------------- */

export function buildDashboardStageSummaries(
  cases: DashboardCase[],
  snapshots: Record<string, DashboardCaseSnapshot>,
): DashboardStageSummary[] {
  const activeCaseIds = new Set(
    cases
      .filter((item) => item.case_status === "ACTIVE")
      .map((item) => item.id),
  );

  return STAGES.map((stage) => {
    const stageCases = cases.filter(
      (item) =>
        item.case_status === "ACTIVE" &&
        item.current_stage === stage,
    );

    const confirmed = Object.entries(snapshots)
      .filter(([caseId]) => activeCaseIds.has(caseId))
      .reduce((count, [, snapshot]) => {
        const stageConfirmedCount =
          snapshot.clinicalResults.filter(
            (result) =>
              result.workflow_stage === stage &&
              result.result_status === "CONFIRMED",
          ).length;

        return count + stageConfirmedCount;
      }, 0);

    let resultWaiting = 0;
    let confirmationWaiting = 0;
    let progressing = 0;

    stageCases.forEach((caseItem) => {
      const snapshot = snapshots[caseItem.id];

      const clinical = snapshot?.clinicalResults.find(
        (result) => result.workflow_stage === stage,
      );

      const activeOrder = snapshot?.orders.some(
        (order) =>
          order.order_type === stage &&
          ["ORDERED", "SCHEDULED"].includes(order.status),
      );

      if (clinical?.result_status === "DRAFT") {
        confirmationWaiting += 1;
      } else if (activeOrder) {
        resultWaiting += 1;
      } else {
        progressing += 1;
      }
    });

    return {
      stage,
      label: STAGE_LABELS[stage],
      total: stageCases.length,
      progressing,
      resultWaiting,
      confirmationWaiting,
      confirmed,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Current Action classification                                              */
/* -------------------------------------------------------------------------- */

function classifyAction(action: CurrentAction) {
  if (action.source === "ORDER") {
    return {
      kind: "ORDER",
      label: "오더 확인",
    };
  }

  if (action.source === "AI") {
    return {
      kind: "AI",
      label: "결과 검토",
    };
  }

  if (action.source === "PRESCRIPTION") {
    return {
      kind: "PRESCRIPTION",
      label: "처방 확인",
    };
  }

  return /DRAFT|저장|대기/.test(action.status)
    ? {
        kind: "CONFIRM",
        label: "확정 필요",
      }
    : {
        kind: "RESULT",
        label: "결과 확인",
      };
}

/* -------------------------------------------------------------------------- */
/* Patient Journey                                                            */
/* -------------------------------------------------------------------------- */

function buildPatientJourney(
  selectedCase: DashboardCase | undefined,
  snapshot: DashboardCaseSnapshot | undefined,
): JourneyItem[] {
  const journeyStages: Stage[] = [
    "XRAY",
    "CT",
    "PET_CT_TNM",
    "PATHOLOGY_GENE",
    "PDL1",
  ];

  if (!selectedCase) {
    return journeyStages.map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      state: "waiting",
      description: "Case 없음",
    }));
  }

  const currentIndex = STAGES.indexOf(
    selectedCase.current_stage as Stage,
  );

  return journeyStages.map((stage) => {
    const stageIndex = STAGES.indexOf(stage);

    const clinical = snapshot?.clinicalResults.find(
      (result) => result.workflow_stage === stage,
    );

    const aiSucceeded = snapshot?.aiResults.some(
      (result) =>
        result.analysis_type === `${stage}_ANALYSIS` &&
        result.status === "SUCCEEDED",
    );

    const activeOrder = snapshot?.orders.some(
      (order) =>
        order.order_type === stage &&
        ["ORDERED", "SCHEDULED"].includes(order.status),
    );

    if (clinical?.result_status === "CONFIRMED") {
      return {
        stage,
        label: STAGE_LABELS[stage],
        state: "confirmed",
        description: "확정 완료",
      };
    }

    if (selectedCase.current_stage === stage) {
      let description = "진행 중";

      if (clinical?.result_status === "DRAFT") {
        description = "확정 대기";
      } else if (aiSucceeded) {
        description = "AI 분석 완료";
      } else if (activeOrder) {
        description = "결과 대기";
      }

      return {
        stage,
        label: STAGE_LABELS[stage],
        state: "active",
        description,
      };
    }

    if (currentIndex >= 0 && stageIndex < currentIndex) {
      return {
        stage,
        label: STAGE_LABELS[stage],
        state: "confirmed",
        description: "완료",
      };
    }

    return {
      stage,
      label: STAGE_LABELS[stage],
      state: "waiting",
      description: "대기",
    };
  });
}


type DashboardAppointment = {
  id: string;
  caseId: string;
  caseCode: string;
  patientName: string;
  patientCode: string;
  orderType: string;
  orderLabel: string;
  scheduledAt: string;
  status: string;
  appointmentStatus?: string | null;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-");
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatAppointmentTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function appointmentStatusLabel(
  appointmentStatus?: string | null,
  orderStatus?: string,
) {
  const status = appointmentStatus || orderStatus || "";

  if (["CONFIRMED", "SCHEDULED"].includes(status)) {
    return "예약 확정";
  }

  if (["REQUESTED", "PENDING", "ORDERED"].includes(status)) {
    return "예약 요청";
  }

  if (status === "COMPLETED") {
    return "검사 완료";
  }

  if (status === "CANCELLED") {
    return "취소";
  }

  return status || "일정";
}

function appointmentStatusClass(
  appointmentStatus?: string | null,
  orderStatus?: string,
) {
  const status = appointmentStatus || orderStatus || "";

  if (["CONFIRMED", "SCHEDULED"].includes(status)) {
    return "bg-emerald-50 text-emerald-700";
  }

  if (["REQUESTED", "PENDING", "ORDERED"].includes(status)) {
    return "bg-amber-50 text-amber-700";
  }

  if (status === "COMPLETED") {
    return "bg-blue-50 text-blue-700";
  }

  if (status === "CANCELLED") {
    return "bg-slate-100 text-slate-500";
  }

  return "bg-slate-100 text-slate-600";
}

export function buildDashboardAppointments(
  cases: DashboardCase[],
  snapshots: Record<string, DashboardCaseSnapshot>,
  patientAppointments: DashboardPatientAppointment[],
): DashboardAppointment[] {
  const caseById = new Map(
    cases.map((caseItem) => [caseItem.id, caseItem]),
  );

  const appointments: DashboardAppointment[] = [];

  Object.entries(snapshots).forEach(([caseId, snapshot]) => {
    const caseItem = caseById.get(caseId);

    if (!caseItem || caseItem.case_status !== "ACTIVE") {
      return;
    }

    snapshot.orders.forEach((order) => {
      if (
        !order.scheduled_at ||
        order.status === "CANCELLED" ||
        order.appointment_status === "CANCELLED"
      ) {
        return;
      }

      appointments.push({
        id: order.id,
        caseId,
        caseCode: caseItem.case_code,
        patientName:
          caseItem.patient_name || caseItem.patient_code,
        patientCode: caseItem.patient_code,
        orderType: order.order_type,
        orderLabel:
          order.order_type_label ||
          STAGE_LABELS[order.order_type as Stage] ||
          order.order_type,
        scheduledAt: order.scheduled_at,
        status: order.status,
        appointmentStatus: order.appointment_status,
      });
    });
  });

  patientAppointments.forEach((appointment) => {
    appointments.push({
      id: `patient-${appointment.id}`,
      caseId: "",
      caseCode: appointment.case_code ?? "",
      patientName: appointment.patient_name || appointment.patient_code,
      patientCode: appointment.patient_code,
      orderType: "APPOINTMENT",
      orderLabel: appointment.appointment_status === "CONFIRMED" ? "진료 예약" : "진료 예약 요청",
      scheduledAt: appointment.scheduled_at,
      status: appointment.appointment_status,
      appointmentStatus: appointment.appointment_status,
    });
  });

  return appointments.sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() -
      new Date(b.scheduledAt).getTime(),
  );
}

function buildCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const leading = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days: Array<{
    date: Date;
    key: string;
    inMonth: boolean;
  }> = [];

  for (let offset = leading - 1; offset >= 0; offset -= 1) {
    const date = new Date(year, month, -offset);
    days.push({
      date,
      key: toLocalDateKey(date),
      inMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    days.push({
      date,
      key: toLocalDateKey(date),
      inMonth: true,
    });
  }

  while (days.length % 7 !== 0) {
    const date = new Date(
      year,
      month + 1,
      days.length - leading - daysInMonth + 1,
    );

    days.push({
      date,
      key: toLocalDateKey(date),
      inMonth: false,
    });
  }

  return days;
}


type ClinicalTimelineItem = {
  stage: Stage;
  label: string;
  state: JourneyState;
  status: string;
  dateLabel: string;
};

function formatTimelineDate(value?: string | null) {
  if (!value) {
    return "날짜 없음";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "날짜 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildClinicalTimeline(
  selectedCase: DashboardCase | undefined,
  snapshot: DashboardCaseSnapshot | undefined,
): ClinicalTimelineItem[] {
  const timelineStages: Stage[] = [
    "XRAY",
    "CT",
    "PET_CT_TNM",
    "PATHOLOGY_GENE",
    "PDL1",
  ];

  const currentIndex = selectedCase
    ? STAGES.indexOf(selectedCase.current_stage as Stage)
    : -1;

  return timelineStages.map((stage) => {
    const clinical = snapshot?.clinicalResults.find(
      (result) => result.workflow_stage === stage,
    );

    const stageOrders =
      snapshot?.orders.filter(
        (order) => order.order_type === stage,
      ) ?? [];

    const order =
      stageOrders.find((item) => item.scheduled_at) ??
      stageOrders[0];

    const stageIndex = STAGES.indexOf(stage);

    let state: JourneyState = "waiting";
    let status = "대기";

    if (clinical?.result_status === "CONFIRMED") {
      state = "confirmed";
      status = "확정";
    } else if (
      selectedCase?.current_stage === stage
    ) {
      state = "active";

      if (clinical?.result_status === "DRAFT") {
        status = "확정 대기";
      } else if (order?.status === "SCHEDULED") {
        status = "예약됨";
      } else if (order?.status === "ORDERED") {
        status = "오더됨";
      } else {
        status = "진행 중";
      }
    } else if (
      currentIndex >= 0 &&
      stageIndex < currentIndex
    ) {
      state = "confirmed";
      status = "완료";
    }

    const dateValue =
      clinical?.result_date ??
      clinical?.updated_at ??
      clinical?.created_at ??
      order?.scheduled_at ??
      order?.updated_at ??
      order?.created_at ??
      null;

    return {
      stage,
      label: STAGE_LABELS[stage],
      state,
      status,
      dateLabel: formatTimelineDate(dateValue),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export function DashboardWorkQueues({
  cases,
  snapshots,
  consultations,
  notifications,
  patientAppointments = [],
  unreadNotificationCount,
  selectedCaseId,
  onSelectCase,
  onOpenCase,
  onOpenConsultations,
  onOpenNotification,
  onOpenNotifications,
}: {
  cases: DashboardCase[];
  snapshots: Record<string, DashboardCaseSnapshot>;
  consultations: DashboardConsultation[];
  notifications: DashboardNotification[];
  patientAppointments?: DashboardPatientAppointment[];
  unreadNotificationCount: number;

  /*
   * page.tsx에서 전달받는 현재 Dashboard 대표 Case.
   */
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;

  onOpenCase: (caseId: string) => void;
  onOpenConsultations: () => void;
  onOpenNotification: (
    notification: DashboardNotification,
  ) => void;
  onOpenNotifications: () => void;
}) {
  const stageSummaries = buildDashboardStageSummaries(
    cases,
    snapshots,
  );

  const groups = buildDashboardWorkGroups(
    cases,
    snapshots,
    consultations,
  );

  const queue = buildDashboardReviewQueue(
    cases,
    snapshots,
    consultations,
  );

  const activeCases = cases.filter(
    (item) => item.case_status === "ACTIVE",
  );

  const activeCaseCount = activeCases.length;

  /*
   * page.tsx에서 전달한 Case를 최우선으로 사용.
   * ACTIVE 목록에서 사라졌으면 첫 ACTIVE Case로 fallback.
   */
  const selectedCase =
    activeCases.find(
      (item) => item.id === selectedCaseId,
    ) ?? activeCases[0];

  const selectedSnapshot = selectedCase
    ? snapshots[selectedCase.id]
    : undefined;

  const journey = buildPatientJourney(
    selectedCase,
    selectedSnapshot,
  );

  const clinicalTimeline = buildClinicalTimeline(
    selectedCase,
    selectedSnapshot,
  );

  const consultationCounts = {
    requested: consultations.filter(
      (item) => item.status === "REQUESTED",
    ).length,

    acknowledged: consultations.filter(
      (item) => item.status === "ACKNOWLEDGED",
    ).length,

    responded: consultations.filter(
      (item) => item.status === "RESPONDED",
    ).length,
  };

  const recentNotifications = notifications.slice(0, 3);

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(
    () => toLocalDateKey(today),
    [today],
  );

  const [selectedScheduleDate, setSelectedScheduleDate] =
    useState(todayKey);

  const [calendarMonth, setCalendarMonth] = useState(
    () =>
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1,
      ),
  );

  const appointments = useMemo(
    () => buildDashboardAppointments(cases, snapshots, patientAppointments),
    [cases, patientAppointments, snapshots],
  );

  const appointmentCountsByDate = useMemo(() => {
    const counts = new Map<string, number>();

    appointments.forEach((appointment) => {
      const key = toLocalDateKey(
        appointment.scheduledAt,
      );

      if (!key) {
        return;
      }

      counts.set(
        key,
        (counts.get(key) ?? 0) + 1,
      );
    });

    return counts;
  }, [appointments]);

  const selectedDateAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          toLocalDateKey(appointment.scheduledAt) ===
          selectedScheduleDate,
      ),
    [appointments, selectedScheduleDate],
  );

  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth),
    [calendarMonth],
  );

  const selectedDate = parseDateKey(
    selectedScheduleDate,
  );

  const selectedDateTitle =
    selectedScheduleDate === todayKey
      ? "오늘 예약 일정"
      : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 예약 일정`;

  return (
    <div className="grid gap-4">
      {/* ================================================================ */}
      {/* TOP                                                              */}
      {/* ================================================================ */}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,13fr)_minmax(340px,7fr)]">
        {/* 환자 진료 맵 */}

        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                Patient Journey
              </p>

              <h2 className="mt-1 text-base font-bold text-slate-900">
                환자 진료 맵
              </h2>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                선택된 Case의 진단 및 치료 진행 상태를 한눈에
                확인합니다.
              </p>
            </div>

            {activeCases.length > 0 ? (
              <div className="flex shrink-0 items-end gap-2">
                <label className="min-w-0">
                  <span className="block text-[10px] font-semibold text-slate-400">
                    표시할 Case
                  </span>

                  <select
                    value={selectedCase?.id ?? ""}
                    onChange={(event) => {
                      onSelectCase(event.target.value);
                    }}
                    className="mt-1 min-w-[210px] max-w-[280px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {activeCases.map((caseItem) => (
                      <option key={caseItem.id} value={caseItem.id}>
                        {caseItem.patient_name || caseItem.patient_code}
                        {" · "}
                        {caseItem.case_code}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedCase && (
                  <button
                    type="button"
                    onClick={() => onOpenCase(selectedCase.id)}
                    className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                  >
                    Case 열기
                  </button>
                )}
              </div>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-semibold text-slate-500">
                ACTIVE Case 없음
              </span>
            )}
          </header>

          <div className="grid min-h-[340px] gap-4 p-5 lg:grid-cols-[minmax(240px,5fr)_minmax(0,7fr)]">
            {/* 폐/인체 시각화 */}

            <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-xl border border-blue-100/60 bg-gradient-to-b from-blue-50/80 via-white to-slate-50">
              <div className="absolute inset-x-0 top-5 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Respiratory Overview
                </p>
              </div>

              <div className="h-[250px] w-[160px]">
                <HumanLungIllustration />
              </div>

              <div className="absolute bottom-4 left-1/2 w-[calc(100%-32px)] max-w-[230px] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 text-center shadow-sm backdrop-blur">
                <p className="truncate text-xs font-bold text-slate-800">
                  {selectedCase
                    ? selectedCase.patient_name ||
                      selectedCase.patient_code
                    : "선택된 Case 없음"}
                </p>

                {selectedCase && (
                  <>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      {selectedCase.case_code}
                    </p>

                    <p className="mt-1 text-[10px] font-semibold text-blue-600">
                      현재 단계 ·{" "}
                      {STAGE_LABELS[
                        selectedCase.current_stage as Stage
                      ] ?? selectedCase.current_stage}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* 단계 카드 */}

            <div className="grid content-center gap-2.5 sm:grid-cols-2">
              {journey.map((item) => {
                const stageSummary = stageSummaries.find(
                  (summary) => summary.stage === item.stage,
                );

                return (
                  <JourneyCard
                    key={item.stage}
                    item={item}
                    count={stageSummary?.total ?? 0}
                    onClick={
                      selectedCase
                        ? () => onOpenCase(selectedCase.id)
                        : undefined
                    }
                  />
                );
              })}

              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 sm:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">
                      이후 진료
                    </p>

                    <p className="mt-1 text-[11px] leading-4 text-slate-400">
                      PD-L1 확인 이후 치료결정과 처방 단계로
                      이어집니다.
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 text-[10px] font-semibold text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">
                      치료결정
                    </span>

                    <span className="text-slate-300">→</span>

                    <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">
                      처방
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="border-t border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-800">
                  진료 타임라인
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  선택된 Case의 주요 검사·확정 날짜입니다.
                </p>
              </div>

              {selectedCase && (
                <span className="max-w-[180px] truncate rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-semibold text-blue-700">
                  {selectedCase.patient_name ||
                    selectedCase.patient_code}
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-5 gap-2">
              {clinicalTimeline.map((item, index) => {
                const tone = {
                  confirmed: {
                    dot: "bg-emerald-500",
                    line: "bg-emerald-200",
                    badge:
                      "bg-emerald-50 text-emerald-700",
                  },
                  active: {
                    dot: "bg-blue-600 ring-4 ring-blue-100",
                    line: "bg-slate-200",
                    badge:
                      "bg-blue-50 text-blue-700",
                  },
                  waiting: {
                    dot: "bg-slate-300",
                    line: "bg-slate-200",
                    badge:
                      "bg-slate-100 text-slate-500",
                  },
                }[item.state];

                return (
                  <div
                    key={item.stage}
                    className="relative min-w-0"
                  >
                    {index < clinicalTimeline.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={`absolute left-[calc(50%+10px)] right-[calc(-50%+10px)] top-[7px] h-px ${tone.line}`}
                      />
                    )}

                    <div className="relative z-10 flex flex-col items-center text-center">
                      <span
                        className={`h-3.5 w-3.5 rounded-full border-2 border-white ${tone.dot}`}
                      />

                      <p
                        className="mt-2 w-full truncate text-[10px] font-bold text-slate-700"
                        title={item.label}
                      >
                        {item.label}
                      </p>

                      <p className="mt-0.5 text-[9px] font-medium tabular-nums text-slate-400">
                        {item.dateLabel}
                      </p>

                      <span
                        className={`mt-1 rounded-full px-2 py-0.5 text-[8px] font-semibold ${tone.badge}`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </article>

        {/* 오늘 업무 요약 */}

        <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">
              오늘 업무 요약
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              현재 담당 Case와 우선 처리 업무입니다.
            </p>
          </header>

          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
            <SummaryMetric
              label="진행 중 Case"
              value={activeCaseCount}
              tone="slate"
            />

            <SummaryMetric
              label="검토 대기"
              value={queue.length}
              tone="blue"
            />

            <SummaryMetric
              label="새 알림"
              value={unreadNotificationCount}
              tone="amber"
            />
          </div>

          <div className="p-4">
            <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr] xl:grid-cols-1 2xl:grid-cols-[0.95fr_1.05fr]">
              {/* Mini calendar */}
              <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-blue-600">
                      Calendar
                    </p>
                    <h3 className="mt-0.5 whitespace-nowrap text-[14px] font-bold leading-none tracking-[-0.01em] text-slate-800">
                      {calendarMonth.getFullYear()}년{" "}
                      {calendarMonth.getMonth() + 1}월
                    </h3>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (current) =>
                            new Date(
                              current.getFullYear(),
                              current.getMonth() - 1,
                              1,
                            ),
                        )
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[14px] font-bold leading-none text-slate-500 transition hover:border-blue-200 hover:text-blue-700"
                      aria-label="이전 달"
                    >
                      ‹
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCalendarMonth(
                          new Date(
                            today.getFullYear(),
                            today.getMonth(),
                            1,
                          ),
                        );
                        setSelectedScheduleDate(todayKey);
                      }}
                      className="h-8 min-w-[42px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold leading-none text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                    >
                      오늘
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (current) =>
                            new Date(
                              current.getFullYear(),
                              current.getMonth() + 1,
                              1,
                            ),
                        )
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[14px] font-bold leading-none text-slate-500 transition hover:border-blue-200 hover:text-blue-700"
                      aria-label="다음 달"
                    >
                      ›
                    </button>
                  </div>
                </div>

                <div className="mt-3.5 grid grid-cols-7 items-center text-center">
                  {["일", "월", "화", "수", "목", "금", "토"].map(
                    (day, index) => (
                      <span
                        key={day}
                        className={`pb-1.5 text-[9px] font-semibold leading-none ${
                          index === 0
                            ? "text-rose-400"
                            : index === 6
                              ? "text-blue-400"
                              : "text-slate-400"
                        }`}
                      >
                        {day}
                      </span>
                    ),
                  )}

                  {calendarDays.map((day) => {
                    const selected =
                      day.key === selectedScheduleDate;
                    const isToday = day.key === todayKey;
                    const appointmentCount =
                      appointmentCountsByDate.get(day.key) ?? 0;

                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => {
                          setSelectedScheduleDate(day.key);

                          if (
                            day.date.getMonth() !==
                            calendarMonth.getMonth()
                          ) {
                            setCalendarMonth(
                              new Date(
                                day.date.getFullYear(),
                                day.date.getMonth(),
                                1,
                              ),
                            );
                          }
                        }}
                        className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold leading-none transition ${
                          selected
                            ? "bg-blue-600 text-white shadow-sm"
                            : isToday
                              ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                              : day.inMonth
                                ? "text-slate-600 hover:bg-white hover:text-blue-700"
                                : "text-slate-300"
                        }`}
                        aria-label={`${day.date.getMonth() + 1}월 ${day.date.getDate()}일${appointmentCount ? `, 예약 ${appointmentCount}건` : ""}`}
                      >
                        {day.date.getDate()}

                        {appointmentCount > 0 && (
                          <span
                            aria-hidden="true"
                            className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                              selected
                                ? "bg-white"
                                : "bg-emerald-500"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Appointment list */}
              <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
                      Schedule
                    </p>
                    <h3 className="mt-0.5 truncate text-xs font-bold text-slate-800">
                      {selectedDateTitle}
                    </h3>
                  </div>

                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">
                    {selectedDateAppointments.length}건
                  </span>
                </div>

                {selectedDateAppointments.length ? (
                  <div className="mt-2 max-h-[174px] space-y-1.5 overflow-y-auto pr-1">
                    {selectedDateAppointments.map(
                      (appointment) => (
                        <button
                          key={appointment.id}
                          type="button"
                          disabled={!appointment.caseId}
                          onClick={() => appointment.caseId && onOpenCase(appointment.caseId)}
                          className="group flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-blue-100 hover:bg-blue-50/60 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"
                        >
                          <span className="w-10 shrink-0 pt-0.5 text-[10px] font-bold tabular-nums text-slate-700">
                            {formatAppointmentTime(
                              appointment.scheduledAt,
                            )}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[10px] font-bold text-slate-800">
                                {appointment.patientName}
                              </span>
                              <span className="shrink-0 text-[8px] text-slate-400">
                                {appointment.patientCode}
                              </span>
                            </span>

                            <span className="mt-0.5 block truncate text-[9px] text-slate-500">
                              {appointment.orderLabel}
                            </span>
                          </span>

                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${appointmentStatusClass(
                              appointment.appointmentStatus,
                              appointment.status,
                            )}`}
                          >
                            {appointmentStatusLabel(
                              appointment.appointmentStatus,
                              appointment.status,
                            )}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex min-h-[108px] items-center justify-center rounded-lg bg-slate-50 px-3 text-center">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500">
                        예약 일정이 없습니다.
                      </p>
                      <p className="mt-1 text-[9px] text-slate-400">
                        예약이 등록되면 시간순으로 표시됩니다.
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* Compact current actions */}
            <section className="mt-3 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold text-slate-800">
                  지금 해야 할 일
                </h3>

                {groups.length > 0 && (
                  <span className="text-[10px] font-medium text-slate-400">
                    {groups.reduce(
                      (total, group) => total + group.count,
                      0,
                    )}
                    건
                  </span>
                )}
              </div>

              {groups.length ? (
                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {groups.slice(0, 2).map((group, index) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => onOpenCase(group.caseId)}
                      className="group flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-left transition hover:bg-blue-50"
                    >
                      <span
                        className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg px-1 text-[10px] font-bold ${
                          index === 0
                            ? "bg-rose-50 text-rose-600"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {group.count}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-semibold text-slate-700">
                          {group.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[9px] text-slate-400">
                          {group.detail}
                        </span>
                      </span>

                      <span className="shrink-0 text-[9px] font-bold text-blue-600">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-3 text-center text-[10px] text-slate-400">
                  현재 우선 처리할 업무가 없습니다.
                </p>
              )}
            </section>

            <PersonalMemoEditor key={selectedCase?.id ?? "none"} selectedCase={selectedCase} />
          </div>
        </aside>
      </section>

      {/* ================================================================ */}
      {/* BOTTOM                                                           */}
      {/* ================================================================ */}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,13fr)_minmax(340px,7fr)]">
        {/* 업무 우선순위 */}

        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                업무 우선순위
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                의료진이 현재 처리해야 하는 Actionable
                Case입니다.
              </p>
            </div>

            {queue.length > 0 && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                {queue.length}건
              </span>
            )}
          </header>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500">
                <tr>
                  <th className="w-[20%] px-4 py-2.5 font-medium">
                    환자
                  </th>

                  <th className="w-[19%] px-4 py-2.5 font-medium">
                    현재 단계
                  </th>

                  <th className="w-[19%] px-4 py-2.5 font-medium">
                    현재 상태
                  </th>

                  <th className="w-[27%] px-4 py-2.5 font-medium">
                    필요한 행동
                  </th>

                  <th className="w-[15%] px-4 py-2.5 text-right font-medium">
                    바로가기
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {queue.slice(0, 6).map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onOpenCase(item.caseId)}
                    className="cursor-pointer transition hover:bg-blue-50/60"
                  >
                    <td className="truncate px-4 py-3.5 font-semibold text-slate-800">
                      {item.patient}
                    </td>

                    <td className="px-4 py-3.5 text-slate-600">
                      {item.stage}
                    </td>

                    <td className="px-4 py-3.5 text-slate-500">
                      {item.status}
                    </td>

                    <td className="px-4 py-3.5 font-semibold text-blue-700">
                      {item.action}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenCase(item.caseId);
                        }}
                        className="whitespace-nowrap rounded-lg border border-blue-100 bg-white px-3 py-1.5 font-semibold text-blue-700 transition hover:bg-blue-50"
                      >
                        Case 열기
                      </button>
                    </td>
                  </tr>
                ))}

                {queue.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-slate-400"
                    >
                      현재 우선 처리할 업무가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        {/* 협진 / 알림 */}

        <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">
              협진 / 알림 요약
            </h2>
          </header>

          <section className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold text-slate-800">
                협진 현황
              </h3>

              <button
                type="button"
                onClick={onOpenConsultations}
                className="text-[10px] font-semibold text-blue-700 hover:underline"
              >
                전체 보기 →
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <StatusCount
                label="응답 대기"
                value={consultationCounts.requested}
                tone="amber"
              />

              <StatusCount
                label="진행"
                value={consultationCounts.acknowledged}
                tone="blue"
              />

              <StatusCount
                label="완료"
                value={consultationCounts.responded}
                tone="teal"
              />
            </div>
          </section>

          <section className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-800">
                  최근 알림
                </h3>

                {unreadNotificationCount > 0 && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                    읽지 않음 {unreadNotificationCount}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={onOpenNotifications}
                className="text-[10px] font-semibold text-blue-700 hover:underline"
              >
                전체 보기 →
              </button>
            </div>

            {recentNotifications.length ? (
              <div className="mt-2 divide-y divide-slate-100">
                {recentNotifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() =>
                      onOpenNotification(notification)
                    }
                    className="group flex w-full items-start gap-2.5 py-2.5 text-left"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        notification.read_at
                          ? "bg-slate-200"
                          : "bg-blue-500"
                      }`}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold text-slate-700 transition group-hover:text-blue-700">
                        {notification.title}
                      </span>

                      <span className="mt-0.5 block truncate text-[10px] leading-4 text-slate-400">
                        {notification.message}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-5 text-center text-xs text-slate-400">
                표시할 알림이 없습니다.
              </p>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Journey Card                                                               */
/* -------------------------------------------------------------------------- */

function JourneyCard({
  item,
  count,
  onClick,
}: {
  item: JourneyItem;
  count: number;
  onClick?: () => void;
}) {
  const style = {
    confirmed: {
      dot: "bg-teal-500",
      icon: "bg-teal-50 text-teal-700",
      badge: "bg-teal-50 text-teal-700",
      border: "border-teal-100",
      status: "완료",
    },

    active: {
      dot: "bg-blue-500",
      icon: "bg-blue-50 text-blue-700",
      badge: "bg-blue-50 text-blue-700",
      border: "border-blue-200",
      status: "진행",
    },

    waiting: {
      dot: "bg-slate-300",
      icon: "bg-slate-50 text-slate-500",
      badge: "bg-slate-100 text-slate-500",
      border: "border-slate-200",
      status: "대기",
    },
  }[item.state];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`group min-w-0 rounded-xl border bg-white px-3.5 py-3 text-left transition ${
        style.border
      } ${
        onClick
          ? "hover:border-blue-200 hover:bg-blue-50/40"
          : "cursor-default"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${style.icon}`}
        >
          {getStageIcon(item.stage)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-bold text-slate-800">
              {item.label}
            </p>

            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${style.badge}`}
            >
              {style.status}
            </span>
          </div>

          <p className="mt-1 truncate text-[11px] font-medium text-slate-600">
            {item.description}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${style.dot}`}
            />

            <span className="text-[10px] text-slate-400">
              현재 Case {count}건
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary Metric                                                             */
/* -------------------------------------------------------------------------- */

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "blue" | "amber";
}) {
  const colors = {
    slate: "text-slate-900",
    blue: "text-blue-700",
    amber: "text-amber-700",
  };

  return (
    <div className="min-w-0 px-3 py-4 text-center">
      <p
        className={`text-2xl font-bold ${colors[tone]}`}
      >
        {value}
      </p>

      <p className="mt-1 text-[10px] font-medium text-slate-500">
        {label}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status Count                                                               */
/* -------------------------------------------------------------------------- */


function PersonalMemoEditor({
  selectedCase,
}: {
  selectedCase?: DashboardCase;
}) {
  const storageKey = selectedCase
    ? `respiratory-dashboard-memo:${selectedCase.id}`
    : "";

  const [memoDraft, setMemoDraft] = useState(() => {
    if (!storageKey || typeof window === "undefined") {
      return "";
    }

    try {
      return window.localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });

  const [memoSaved, setMemoSaved] = useState(() => {
    if (!storageKey || typeof window === "undefined") {
      return false;
    }

    try {
      return Boolean(window.localStorage.getItem(storageKey));
    } catch {
      return false;
    }
  });

  const savePersonalMemo = () => {
    if (!storageKey) return;

    try {
      const value = memoDraft.trim();

      if (value) {
        window.localStorage.setItem(storageKey, value);
        setMemoDraft(value);
        setMemoSaved(true);
      } else {
        window.localStorage.removeItem(storageKey);
        setMemoSaved(false);
      }
    } catch {
      setMemoSaved(false);
    }
  };

  const clearPersonalMemo = () => {
    if (!storageKey) return;

    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // 저장소 접근이 실패해도 UI에서는 메모를 비운다.
    }

    setMemoDraft("");
    setMemoSaved(false);
  };

  return (
    <section className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-slate-800">
            내 할 일 메모
          </h3>
          <p className="mt-0.5 text-[9px] text-slate-400">
            진료기록과 분리된 개인 메모 · 이 브라우저에만 저장
          </p>
        </div>

        {memoSaved && (
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-700">
            저장됨
          </span>
        )}
      </div>

      {selectedCase ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[9px] font-semibold text-slate-600">
              {selectedCase.patient_name ||
                selectedCase.patient_code}
              {" · "}
              {selectedCase.case_code}
            </p>

            <span className="shrink-0 text-[8px] text-slate-400">
              {memoDraft.length}/300
            </span>
          </div>

          <textarea
            value={memoDraft}
            onChange={(event) => {
              setMemoDraft(event.target.value.slice(0, 300));
              setMemoSaved(false);
            }}
            onKeyDown={(event) => {
              if (
                (event.ctrlKey || event.metaKey) &&
                event.key === "Enter"
              ) {
                event.preventDefault();
                savePersonalMemo();
              }
            }}
            rows={2}
            placeholder="예: CT 결과 확인 후 보호자 설명 / 내일 PD-L1 결과 확인"
            className="min-h-[58px] w-full resize-none bg-transparent text-[10px] leading-5 text-slate-700 outline-none placeholder:text-slate-400"
          />

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
            <span className="text-[8px] text-slate-400">
              Ctrl + Enter 저장
            </span>

            <div className="flex items-center gap-1.5">
              {memoDraft && (
                <button
                  type="button"
                  onClick={clearPersonalMemo}
                  className="h-7 rounded-lg px-2 text-[9px] font-semibold text-slate-500 transition hover:bg-white hover:text-rose-600"
                >
                  비우기
                </button>
              )}

              <button
                type="button"
                onClick={savePersonalMemo}
                disabled={!memoDraft.trim()}
                className="h-7 rounded-lg bg-blue-600 px-2.5 text-[9px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                메모 저장
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-3 text-center text-[10px] text-slate-400">
          Case를 선택하면 개인 메모를 작성할 수 있습니다.
        </p>
      )}
    </section>
  );
}

function StatusCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "teal";
}) {
  const colors = {
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    teal: "bg-teal-50 text-teal-700",
  };

  return (
    <div
      className={`rounded-xl px-2 py-3 text-center ${colors[tone]}`}
    >
      <p className="text-lg font-bold">
        {value}
      </p>

      <p className="mt-0.5 text-[9px] font-medium">
        {label}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Human / Lung visual                                                        */
/* -------------------------------------------------------------------------- */

function HumanLungIllustration() {
  return (
    <svg
      viewBox="0 0 220 360"
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="bodyGradient"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stopColor="#dbeafe"
            stopOpacity="0.8"
          />

          <stop
            offset="100%"
            stopColor="#eff6ff"
            stopOpacity="0.25"
          />
        </linearGradient>

        <linearGradient
          id="lungGradient"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0%"
            stopColor="#60a5fa"
            stopOpacity="0.85"
          />

          <stop
            offset="100%"
            stopColor="#0ea5e9"
            stopOpacity="0.45"
          />
        </linearGradient>
      </defs>

      {/* Head */}

      <ellipse
        cx="110"
        cy="48"
        rx="37"
        ry="43"
        fill="url(#bodyGradient)"
        stroke="#bfdbfe"
        strokeWidth="2"
      />

      {/* Neck */}

      <path
        d="M92 85 L88 110 L132 110 L128 85"
        fill="url(#bodyGradient)"
        stroke="#bfdbfe"
        strokeWidth="2"
      />

      {/* Torso */}

      <path
        d="
          M67 107
          C42 120 36 150 40 196
          C44 244 58 292 75 337
          L145 337
          C162 292 176 244 180 196
          C184 150 178 120 153 107
          C138 99 125 98 110 99
          C95 98 82 99 67 107
        "
        fill="url(#bodyGradient)"
        stroke="#bfdbfe"
        strokeWidth="2"
      />

      {/* Arms */}

      <path
        d="M60 120 C35 145 22 188 17 247"
        fill="none"
        stroke="#bfdbfe"
        strokeWidth="13"
        strokeLinecap="round"
        opacity="0.55"
      />

      <path
        d="M160 120 C185 145 198 188 203 247"
        fill="none"
        stroke="#bfdbfe"
        strokeWidth="13"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* Trachea */}

      <path
        d="M110 88 L110 142"
        stroke="#60a5fa"
        strokeWidth="7"
        strokeLinecap="round"
      />

      <path
        d="M110 136 L87 158"
        stroke="#60a5fa"
        strokeWidth="5"
        strokeLinecap="round"
      />

      <path
        d="M110 136 L133 158"
        stroke="#60a5fa"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Left Lung */}

      <path
        d="
          M102 137
          C83 126 64 138 58 165
          C52 190 55 225 65 245
          C74 262 93 260 101 245
          C106 234 105 214 104 197
          Z
        "
        fill="url(#lungGradient)"
        stroke="#3b82f6"
        strokeWidth="2"
      />

      {/* Right Lung */}

      <path
        d="
          M118 137
          C137 126 156 138 162 165
          C168 190 165 225 155 245
          C146 262 127 260 119 245
          C114 234 115 214 116 197
          Z
        "
        fill="url(#lungGradient)"
        stroke="#3b82f6"
        strokeWidth="2"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Stage Icon                                                                 */
/* -------------------------------------------------------------------------- */

function getStageIcon(stage: Stage) {
  switch (stage) {
    case "XRAY":
      return "XR";

    case "CT":
      return "CT";

    case "PET_CT_TNM":
      return "TNM";

    case "PATHOLOGY_GENE":
      return "PATH";

    case "PDL1":
      return "PD";

    case "TREATMENT":
      return "TX";

    case "PRESCRIPTION":
      return "RX";

    default:
      return "•";
  }
}
