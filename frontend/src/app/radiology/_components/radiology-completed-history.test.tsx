import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { RadiologyCompletedHistory } from "./radiology-completed-history";
import { fetchRadiologyCompletedExams } from "../_lib/radiology-api";

vi.mock("../_lib/radiology-api", () => ({
  fetchRadiologyCompletedExams: vi.fn(),
  fetchRadiologyXrayImage: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it("groups completed exams by case and opens each read-only exam detail", async () => {
  vi.mocked(fetchRadiologyCompletedExams).mockResolvedValue([
    {
      patient: { id: "patient-1", name: "문샘플", patient_code: "CO-PT-0014", birth_date: "1970-01-01", sex: "MALE" },
      case: { id: "case-1", case_code: "CASE-0014", current_stage: "CT", case_status: "ACTIVE" },
      responsible_doctor: null,
      completed_exams: [{
        patient: { id: "patient-1", name: "문샘플", patient_code: "CO-PT-0014", birth_date: "1970-01-01", sex: "MALE" },
        case: { id: "case-1", case_code: "CASE-0014", current_stage: "CT", case_status: "ACTIVE" },
        examination_order: { id: "order-1", order_type: "XRAY", order_type_label: "X-ray", priority: "NORMAL", priority_label: "일반", status: "COMPLETED", status_label: "완료", purpose: "흉부 영상", clinical_note: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
        requesting_doctor: { id: "doctor-1", name: "요청 의사" },
        responsible_doctor: null,
        scheduled_at: null,
        image_asset_count: 0,
        latest_image_asset: null,
        latest_ai_analysis: null,
        workflow_status: "REVIEW_COMPLETED",
        workflow_status_label: "판독 완료",
        ai_result: { assessment: "NEGATIVE", assessment_label: "음성", suspicion_score: null, image: { width: null, height: null }, classification: { prediction: null, assessment: null, suspicion_score: null, probabilities: null }, detections: [], model_revision: null },
        review: { id: "review-1", status: "COMPLETED", assigned_doctor: { id: "doctor-2", name: "판독 의사" }, submitted_at: "2026-01-01T00:00:00Z" },
        completed_at: null,
      }],
    },
  ] as Awaited<ReturnType<typeof fetchRadiologyCompletedExams>>);

  const user = userEvent.setup();
  render(<RadiologyCompletedHistory />);

  expect(await screen.findByText("문샘플")).toBeInTheDocument();
  const summary = screen.getByText("X-ray 분석 완료").closest("summary");
  expect(summary).not.toBeNull();
  expect(summary?.parentElement).not.toHaveAttribute("open");

  await user.click(summary!);

  expect(summary?.parentElement).toHaveAttribute("open");
  expect(screen.getByText("AI 분석 결과 요약")).toBeInTheDocument();
  expect(screen.getByText("대표 영상 미리보기 없음")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /업로드|분석 실행|재실행|제출/ })).not.toBeInTheDocument();
});
