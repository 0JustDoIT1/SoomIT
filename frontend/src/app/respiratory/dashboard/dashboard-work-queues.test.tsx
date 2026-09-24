import { describe, expect, it } from "vitest";
import { buildDashboardAppointments, buildDashboardReviewQueue, buildDashboardStageSummaries, buildDashboardWorkGroups, type DashboardCase, type DashboardCaseSnapshot } from "./dashboard-work-queues";

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
});
