import { describe, expect, it } from "vitest";
import { buildClinicalTimeline, buildDashboardAppointments, buildDashboardReviewQueue, buildDashboardStageSummaries, buildDashboardWorkGroups, buildPatientJourney, type DashboardCase, type DashboardCaseSnapshot } from "./dashboard-work-queues";

const cases: DashboardCase[] = [
  { id: "case-path", case_code: "CASE-1", patient_name: "환자 A", patient_code: "P1", current_stage: "PATHOLOGY_GENE", case_status: "ACTIVE" },
  { id: "case-ct", case_code: "CASE-2", patient_name: "환자 B", patient_code: "P2", current_stage: "CT", case_status: "ACTIVE" },
  { id: "case-pdl1", case_code: "CASE-3", patient_name: "환자 C", patient_code: "P3", current_stage: "PDL1", case_status: "ACTIVE" },
];

const snapshots: Record<string, DashboardCaseSnapshot> = {
  "case-path": { clinicalResults: [{ workflow_stage: "PATHOLOGY_GENE", result_status: "DRAFT" }], aiResults: [], orders: [] },
  "case-ct": { clinicalResults: [], aiResults: [{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED" }], orders: [] },
  "case-pdl1": { clinicalResults: [], aiResults: [], orders: [{ id: "order-1", order_type: "PDL1", status: "SCHEDULED" }] },
};

describe("dashboard work queues", () => {
  it("builds one highest-priority review row per case and includes pending consultations", () => {
    const queue = buildDashboardReviewQueue(cases, snapshots, [{ id: "consult-1", case_id: "case-ct", case_code: "CASE-2", patient_name: "환자 B", status: "REQUESTED", priority: "URGENT", question: "검토 요청" }]);
    expect(queue).toEqual(expect.arrayContaining([
      expect.objectContaining({ caseId: "case-path", status: "제출 완료", action: "호흡기내과 확인 필요" }),
      expect.objectContaining({ caseId: "case-ct", status: "AI 분석 완료", action: "결과 검토 필요" }),
      expect.objectContaining({ caseId: "case-pdl1", status: "예약됨", action: "오더 확인" }),
      expect.objectContaining({ id: "consultation-consult-1", status: "긴급 요청", action: "협진 응답" }),
    ]));
  });

  it("groups current actions by work type", () => {
    const groups = buildDashboardWorkGroups(cases, snapshots, []);
    expect(groups.some((item) => item.key === "AI" && item.count > 0)).toBe(true);
    expect(groups.some((item) => item.key === "ORDER" && item.count > 0)).toBe(true);
  });

  it("summarizes stage states only from active orders and clinical drafts", () => {
    const summaries = buildDashboardStageSummaries(cases, snapshots);
    expect(summaries.find((item) => item.stage === "PATHOLOGY_GENE")).toEqual(expect.objectContaining({ total: 1, confirmationWaiting: 1 }));
    expect(summaries.find((item) => item.stage === "PDL1")).toEqual(expect.objectContaining({ total: 1, resultWaiting: 1 }));
  });

  it.each([
    ["XRAY", "흉부 X-ray"],
    ["CT", "흉부 CT"],
    ["PET_CT_TNM", "PET-CT / TNM"],
    ["PATHOLOGY_GENE", "조직·유전자"],
    ["PDL1", "PD-L1"],
    ["TREATMENT", "치료결정"],
    ["PRESCRIPTION", "처방"],
  ])("uses Case.current_stage=%s for the priority row instead of completed legacy data", (currentStage, label) => {
    const currentCase = { ...cases[0], current_stage: currentStage };
    const queue = buildDashboardReviewQueue([currentCase], {
      [currentCase.id]: {
        clinicalResults: [
          { workflow_stage: "CT", result_status: "CONFIRMED" },
          { workflow_stage: currentStage, result_status: "DRAFT" },
        ],
        aiResults: [{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED" }],
        orders: [{ id: "legacy-ct", order_type: "CT", status: "SCHEDULED" }],
      },
    }, []);

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ stage: label });
  });

  it("keeps the current marker on Case.current_stage even when that stage already has a confirmed result", () => {
    const currentCase = { ...cases[0], current_stage: "PET_CT_TNM" };
    const snapshot = {
      clinicalResults: [
        { workflow_stage: "CT", result_status: "CONFIRMED" },
        { workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED" },
      ],
      aiResults: [],
      orders: [],
    };

    expect(buildPatientJourney(currentCase, snapshot).find((item) => item.stage === "PET_CT_TNM")?.state).toBe("active");
    expect(buildClinicalTimeline(currentCase, snapshot).find((item) => item.stage === "PET_CT_TNM")?.state).toBe("active");
  });

  it("merges refreshed patient appointments with existing examination-order events", () => {
    const appointments = buildDashboardAppointments(cases, {
      ...snapshots,
      "case-pdl1": {
        ...snapshots["case-pdl1"],
        orders: [{
          ...snapshots["case-pdl1"].orders[0],
          scheduled_at: "2026-09-24T08:00:00+09:00",
        }],
      },
    }, [
      {
        id: "appointment-1",
        patient_code: "P9",
        patient_name: "예약 환자",
        case_code: null,
        scheduled_at: "2026-09-24T09:00:00+09:00",
        appointment_status: "REQUESTED",
        appointment_status_label: "요청",
        created_by_type: "PATIENT",
      },
    ]);

    expect(appointments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "order-1", orderType: "PDL1" }),
      expect.objectContaining({
        id: "patient-appointment-1",
        orderType: "APPOINTMENT",
        appointmentStatus: "REQUESTED",
      }),
    ]));
  });

  it("links case appointments, avoids matching order duplicates, and leaves case-less rows disabled", () => {
    const appointments = buildDashboardAppointments(cases, {
      ...snapshots,
      "case-ct": {
        ...snapshots["case-ct"],
        orders: [{
          id: "order-ct",
          order_type: "CT",
          status: "SCHEDULED",
          scheduled_at: "2026-09-25T09:00:00+09:00",
          appointment_status: "CONFIRMED",
        }],
      },
    }, [
      {
        id: "linked-duplicate",
        patient_code: "P2",
        patient_name: "환자 B",
        case_code: "CASE-2",
        scheduled_at: "2026-09-25T09:00:00+09:00",
        appointment_status: "CONFIRMED",
        appointment_status_label: "확정",
        created_by_type: "DOCTOR_ORDER",
      },
      {
        id: "linked-visit",
        patient_code: "P1",
        patient_name: "환자 A",
        case_code: "CASE-1",
        scheduled_at: "2026-09-25T10:00:00+09:00",
        appointment_status: "REQUESTED",
        appointment_status_label: "요청",
        created_by_type: "PATIENT",
      },
      {
        id: "case-less",
        patient_code: "P9",
        patient_name: "예약 환자",
        case_code: null,
        scheduled_at: "2026-09-25T11:00:00+09:00",
        appointment_status: "REQUESTED",
        appointment_status_label: "요청",
        created_by_type: "PATIENT",
      },
    ]);

    expect(appointments.filter((item) => item.scheduledAt === "2026-09-25T09:00:00+09:00")).toHaveLength(1);
    expect(appointments.find((item) => item.id === "patient-linked-visit")?.caseId).toBe("case-path");
    expect(appointments.find((item) => item.id === "patient-case-less")?.caseId).toBe("");
  });
});
