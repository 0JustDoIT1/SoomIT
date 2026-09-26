import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultReviewPanel } from "./result-review-panel";

it("shows the CT-specific flow without a radiology sign-off", () => {
  const { container } = render(<ResultReviewPanel stage="CT" showEvidence={false} clinicalResult={{ workflow_stage: "CT", result_status: "CONFIRMED" }} aiResult={{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED" }} />);
  expect(screen.getByText("CT 영상 등록")).toBeTruthy();
  expect(screen.getAllByText("AI 분석").length).toBeGreaterThan(0);
  expect(screen.getAllByText("호흡기내과 최종 판단").length).toBeGreaterThan(0);
  expect(screen.queryByText("영상의학과 판독")).toBeNull();
  expect(container.querySelectorAll('[data-workflow-state="completed"]')).toHaveLength(3);
});

it("shows the simplified pathology flow while retaining submission-derived confirmation state", () => {
  render(<ResultReviewPanel stage="PATHOLOGY_GENE" showEvidence={false} clinicalResult={{ workflow_stage: "PATHOLOGY_GENE", result_status: "DRAFT" }} aiResult={{ analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED" }} />);
  expect(screen.getByText("검체·WSI 등록")).toBeTruthy();
  expect(screen.getAllByText("AI 분석")).toHaveLength(2);
  expect(screen.getByText("호흡기내과 확인")).toBeTruthy();
  expect(screen.getByText("확인 대기")).toBeTruthy();
  expect(screen.queryByText("병리과 검토")).toBeNull();
  expect(screen.queryByText("호흡기내과에 제출")).toBeNull();
});

it("shows the simplified PD-L1 flow", () => {
  render(<ResultReviewPanel stage="PDL1" showEvidence={false} clinicalResult={{ workflow_stage: "PDL1", result_status: "DRAFT" }} aiResult={{ analysis_type: "PDL1_ANALYSIS", status: "SUCCEEDED" }} />);
  expect(screen.getByText("WSI/데이터 등록")).toBeTruthy();
  expect(screen.getAllByText("AI 분석")).toHaveLength(2);
  expect(screen.getByText("호흡기내과 확정")).toBeTruthy();
  expect(screen.queryByText("병리과 검토")).toBeNull();
  expect(screen.queryByText("호흡기내과에 제출")).toBeNull();
});

it("uses analysis and sync details instead of the duplicate CT review-status card", () => {
  render(<ResultReviewPanel stage="CT" showEvidence={false} lastSyncedAt={new Date("2026-09-18T09:30:00")} onRefreshResults={vi.fn()} aiResult={{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", model_name: "Server Test Radiology CT", model_version_name: "v1.0", started_at: "2026-09-18T09:00:00", completed_at: "2026-09-18T09:10:00", input_context: { source_asset: { series_instance_uid: "1.2.826.0.1" } } }} />);
  expect(screen.getByText("분석 · 영상 정보")).toBeTruthy();
  expect(screen.getByText("Server Test Radiology CT")).toBeTruthy();
  expect(screen.getByText("v1.0")).toBeTruthy();
  expect(screen.getByText("1.2.826.0.1")).toBeTruthy();
  expect(screen.getByText("결과 동기화")).toBeTruthy();
  expect(screen.getByText(/30초 자동 갱신/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "지금 새로고침" })).toBeTruthy();
  expect(screen.queryByText("검토 상태")).toBeNull();
});

describe("ResultReviewPanel", () => {
  it.each(["XRAY", "CT"])("sizes %s to its parent instead of a second viewport calculation", (stage) => {
    const { container } = render(<ResultReviewPanel stage={stage} />);
    expect(container.firstElementChild).toHaveClass("flex-1", "min-h-0", "h-full");
    expect(container.firstElementChild?.className).not.toMatch(/100dvh|min-h-\[540px\]|max-h-\[780px\]/);
    expect(container.querySelector("aside.overflow-y-auto")).toHaveClass("min-h-0", "overflow-y-auto");
  });

  it("shows the specialist-confirmed result before the AI candidate", () => {
    render(<ResultReviewPanel stage="PET_CT_TNM" clinicalResult={{ workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_status_label: "확정", result_detail: { tnm: { t_category: "cT2", n_category: "cN1", m_category: "cM0", stage_group: "IIB" } } }} aiResult={{ analysis_type: "PET_CT_TNM_ANALYSIS", status: "SUCCEEDED", status_label: "성공", result_detail: { tnm: { predicted_t: "cT1", predicted_n: "cN0", predicted_m: "cM0", confidence: 0.82 } } }} />);
    const specialist = screen.getByRole("heading", { name: "호흡기내과 최종 판단" });
    const ai = screen.getByText("AI 분석 후보");
    expect(specialist.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("AI 분석 후보")).toBeTruthy();
    expect(screen.getByText("의료진 확정 결과가 아닌 참고 자료입니다.")).toBeTruthy();
  });

  it("shows explicit empty and viewer waiting states without fabricated values", () => {
    render(<ResultReviewPanel stage="CT" />);
    expect(screen.getByText(/확인 가능한 확정 결과가 없습니다/)).toBeTruthy();
    expect(screen.getByText("현재 검사에 연결된 AI 분석 후보가 없습니다.")).toBeTruthy();
    expect(screen.getByText(/원본 영상을 확인한 뒤 AI 분석 완료 상태를 다시 확인하세요/)).toBeTruthy();
    expect(screen.getByText(/호흡기내과 최종 판단 결과 대기/)).toBeTruthy();
    expect(screen.queryByText("Annotation API 연동 대기")).toBeNull();
    expect(screen.getByText("표시 가능한 원본 영상이 없습니다.")).toBeTruthy();
  });

  it("keeps the successful AI panel when the clinical result request fails", () => {
    const onRetryClinical = vi.fn();
    render(<ResultReviewPanel stage="CT" clinicalError="전문과 결과를 불러오지 못했습니다." onRetryClinical={onRetryClinical} aiResult={{ analysis_type: "CT", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: "HIGH" } } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("전문과 결과를 불러오지 못했습니다.");
    expect(screen.getByText("HIGH")).toBeTruthy();
    screen.getByRole("button", { name: "이 결과 다시 시도" }).click();
    expect(onRetryClinical).toHaveBeenCalledOnce();
  });

  it("prioritizes one selected CT AI nodule and switches its clinical details", () => {
    render(<ResultReviewPanel stage="CT" showEvidence={false} aiResult={{
      analysis_type: "CT_ANALYSIS",
      status: "SUCCEEDED",
      result_detail: { ct: { overall_malignancy_risk: "93.11", nodules: [
        {
          nodule_no: 1,
          malignancy_risk: "93.11",
          finding_payload: {
            quantification: { maximum_3d_diameter_mm: 28.8, volume_mm3: 6834 },
            texture: { prediction_label: "SOLID" },
            morphology: { spiculation: { prediction: "NEGATIVE" }, lobulation: { prediction: "POSITIVE" } },
            malignancy: { prediction: { prediction: "MALIGNANT", probability: 0.9311 } },
          },
        },
        {
          nodule_no: 2,
          malignancy_risk: 12,
          finding_payload: {
            quantification: { equivalent_diameter_mm: 4.25 },
            texture: { prediction: { pattern: "GROUND_GLASS" } },
            morphology: { spiculation: { prediction: "POSITIVE" }, lobulation: { prediction: "NEGATIVE" } },
            malignancy: { prediction: { prediction: "BENIGN" } },
          },
        },
      ] } },
    }} />);

    expect(screen.getByText("CT AI 분석 결과")).toBeTruthy();
    expect(screen.getByText("2개")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "결절 #1" })).toHaveAttribute("aria-selected", "true");
    const first = within(screen.getByTestId("ct-nodule-1"));
    expect(first.getByText("28.8 mm")).toBeTruthy();
    expect(first.getByText("6,834 mm³")).toBeTruthy();
    expect(first.getByText("93.1%")).toBeTruthy();
    expect(first.getByText("고형(Solid)")).toBeTruthy();
    expect(first.getByText("없음")).toBeTruthy();
    expect(first.getByText("있음")).toBeTruthy();
    expect(first.getByText("AI 분류 · 악성 의심")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "결절 #2" }));
    expect(screen.queryByTestId("ct-nodule-1")).toBeNull();
    expect(screen.getByRole("tab", { name: "결절 #2" })).toHaveAttribute("aria-selected", "true");
    const second = within(screen.getByTestId("ct-nodule-2"));
    expect(second.getByText("4.25 mm")).toBeTruthy();
    expect(second.getByText("간유리(GGO)")).toBeTruthy();
    expect(second.getByText("-")).toBeTruthy();
    expect(second.getByText("AI 분류 · 양성 의심")).toBeTruthy();
  });

  it("converts a probability to a readable percent and preserves meaningful zero values", () => {
    render(<ResultReviewPanel stage="CT" showEvidence={false} aiResult={{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: 0, nodules: [
      { nodule_no: 1, finding_payload: { quantification: { maximum_3d_diameter_mm: 0, volume_mm3: 0 }, malignancy: { prediction: { probability: 0.724 } } } },
    ] } } }} />);

    expect(screen.getByText("0%")).toBeTruthy();
    const nodule = within(screen.getByTestId("ct-nodule-1"));
    expect(nodule.getByText("72.4%")).toBeTruthy();
    expect(nodule.getByText("0 mm")).toBeTruthy();
    expect(nodule.getByText("0 mm³")).toBeTruthy();
  });

  it("distinguishes a successful zero-nodule CT result from an AI loading error", () => {
    render(<ResultReviewPanel stage="CT" showEvidence={false} aiResult={{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: null, nodules: [] } } }} />);

    expect(screen.getByText("0개")).toBeTruthy();
    expect(screen.getByText("검출된 결절이 없습니다.")).toBeTruthy();
    expect(screen.queryByText("현재 검사에 연결된 AI 분석 후보가 없습니다.")).toBeNull();
  });

  it("renders one CT nodule safely when detailed values are missing", () => {
    render(<ResultReviewPanel stage="CT" showEvidence={false} aiResult={{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: "NaN", nodules: [{ nodule_no: 1, malignancy_risk: null, finding_payload: { quantification: { maximum_3d_diameter_mm: null, volume_mm3: null } } }] } } }} />);

    expect(screen.getByText("1개")).toBeTruthy();
    const nodule = within(screen.getByTestId("ct-nodule-1"));
    expect(nodule.getByText("결절 #1")).toBeTruthy();
    expect(nodule.getAllByText("-")).toHaveLength(6);
    expect(screen.queryByText("NaN")).toBeNull();
    expect(screen.queryByText("null")).toBeNull();
  });

  it("retries the AI panel independently", () => {
    const onRetryAi = vi.fn();
    render(<ResultReviewPanel stage="CT" aiError="AI 결과를 불러오지 못했습니다." onRetryAi={onRetryAi} />);

    screen.getByRole("button", { name: "이 결과 다시 시도" }).click();
    expect(onRetryAi).toHaveBeenCalledOnce();
  });

  it.each([
    ["XRAY", "흉부 X선", true],
    ["CT", "흉부 CT 검사·결과", true],
    ["PATHOLOGY_GENE", "병리 검사·결과", false],
  ])("uses the shared result layout for %s", (stage, heading, imageWorkspace) => {
    render(<ResultReviewPanel stage={stage} />);
    if (imageWorkspace) {
      expect(screen.queryByRole("heading", { name: heading })).toBeNull();
      expect(screen.getByRole("heading", { name: "호흡기내과 최종 판단" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "AI 분석 후보" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "X-ray Viewer" })).toBeTruthy();
    } else {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "원본 영상" })).toBeTruthy();
    }
    expect(screen.getByText("확정 결과 없음")).toBeTruthy();
    expect(screen.getByText("AI 후보 없음")).toBeTruthy();
  });

  it("maps the actual gene findings arrays from clinical and AI serializers", () => {
    render(
      <ResultReviewPanel
        stage="PATHOLOGY_GENE"
        clinicalResult={{
          workflow_stage: "PATHOLOGY_GENE",
          result_status: "CONFIRMED",
          result_detail: { gene: { findings: [{ gene_symbol: "EGFR", alteration_code: "L858R", assessment_label: "양성" }] } },
        }}
        aiResult={{
          analysis_type: "PATHOLOGY_GENE_ANALYSIS",
          status: "SUCCEEDED",
          result_detail: { genes: [{ gene_symbol: "ALK", predicted_status_label: "음성 예측", predicted_probability: "0.9321" }] },
        }}
      />,
    );

    expect(screen.getByText("EGFR")).toBeTruthy();
    expect(screen.getByText("양성 · L858R")).toBeTruthy();
    expect(screen.getByText("ALK")).toBeTruthy();
    expect(screen.getByText("음성 예측 · 93.21%")).toBeTruthy();
  });

  it("shows the CT Series UID without a storage URI", () => {
    render(<ResultReviewPanel stage="CT" showEvidence={false} aiResult={{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", model_components: { detector: "v2", classifier: "v1" }, input_context: { schema_version: "ct-phase1-v1", examination_order: { id: "order-12345678", order_type_label: "CT" }, source_asset: { image_type: "CT", workflow_stage: "CT", study_instance_uid: "study-1", series_instance_uid: "series-1" } } }} />);

    expect(screen.getByText("분석 입력 추적")).toBeTruthy();
    expect(screen.getByText("CT · #order-12")).toBeTruthy();
    expect(screen.getByText("CT · CT · Series series-1")).toBeTruthy();
    expect(screen.getByText("series-1")).toBeTruthy();
    expect(screen.queryByText(/gs:\/\//)).toBeNull();
  });

it("does not mark failed AI or unconfirmed specialist decisions as completed", () => {
    const { container } = render(<ResultReviewPanel stage="CT" showEvidence={false} aiResult={{ analysis_type: "CT_ANALYSIS", status: "FAILED", status_label: "실패", result_detail: {} }} clinicalResult={{ workflow_stage: "CT", result_status: "DRAFT", result_status_label: "작성 중", result_detail: {} }} />);

    // The input registration is known from the existing AI record, but the
    // failed analysis and unconfirmed clinical decision remain incomplete.
    expect(container.querySelectorAll('[data-workflow-state="completed"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-workflow-state="failed"]')).toHaveLength(1);
  });

  it("uses an error tone only for failed AI status", () => {
    render(<ResultReviewPanel stage="CT" showEvidence={false} aiResult={{ analysis_type: "CT_ANALYSIS", status: "FAILED", status_label: "실패", result_detail: {} }} />);
    expect(screen.getByText("AI · 실패").className).toContain("text-rose-700");
  });

  it("renders repeated result labels without relying on duplicate React keys", () => {
    render(<ResultReviewPanel stage="PATHOLOGY_GENE" showEvidence={false} clinicalResult={{ workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: { pathology: { malignancy_status_label: "악성", histologic_type: "NSCLC", subtype: "LUSC", diagnosis_summary: "악성" } } }} />);
    expect(screen.getAllByText("악성")).toHaveLength(2);
  });
});
