import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Pdl1ResultPanel } from "./pdl1-imaging-workstation";

describe("Pdl1ResultPanel", () => {
  it("shows an honest empty state without the removed gene comparison", () => {
    render(<Pdl1ResultPanel aiResult={null} />);

    expect(screen.getByText("AI 결과 없음")).toBeTruthy();
    expect(screen.getByText(/현재 Case에서 조회된 PD-L1 AI 분석 결과가 없습니다/)).toBeTruthy();
    expect(document.body).not.toHaveTextContent("인증 연동 대기");
    expect(screen.getAllByText("병리과 검토 결과 없음").length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent("유전자 결과 비교");
  });

  it("keeps the AI TPS range separate from the confirmed TPS value", () => {
    render(
      <Pdl1ResultPanel
        aiResult={{
          status_label: "완료",
          model_name: "AMD-MIL",
          model_version_name: "1.0",
          completed_at: "2026-09-11T10:00:00Z",
          result_detail: {
            pdl1: {
              predicted_tps_range_label: "1–49%",
              confidence: 0.8,
              probabilities: { class_0: 0.1, class_1: 0.8, class_2: 0.1 },
            },
          },
        }}
        clinicalResult={{
          result_status: "CONFIRMED",
          result_date: "2026-09-11T11:00:00Z",
          result_detail: {
            pdl1: { tps_percent: 35, interpretation: "확정 해석", note: "판독 소견" },
          },
        }}
      />,
    );

    expect(screen.getAllByText("1–49%").length).toBeGreaterThan(0);
    expect(screen.getByText("35%")).toBeTruthy();
    expect(screen.getByText("최종 TPS")).toBeTruthy();
    expect(screen.getByText("AI 결과는 TPS 예측 구간이며 병리과 TPS 결과는 실제 TPS 값입니다. 호흡기내과 확정 후 최종 TPS로 표시됩니다.")).toBeTruthy();
  });

  it("labels submitted pathology TPS as a review result before pulmonology confirmation", () => {
    render(
      <Pdl1ResultPanel
        aiResult={null}
        clinicalResult={{
          result_status: "DRAFT",
          result_date: null,
          result_detail: { pdl1: { tps_percent: 20, interpretation: "병리과 검토", note: "제출 대기" } },
        }}
      />,
    );

    expect(screen.getByText("병리과 검토 결과")).toBeTruthy();
    expect(screen.getByText("병리과 TPS 결과")).toBeTruthy();
    expect(screen.queryByText("최종 TPS")).toBeNull();
  });

  it("shows an AI error separately and retries only the AI result request", async () => {
    const onRetry = vi.fn();
    render(<Pdl1ResultPanel aiResult={null} aiError="AI 결과 조회 권한이 없습니다." onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("AI 결과 조회 권한이 없습니다.");
    screen.getByRole("button", { name: "PD-L1 결과 다시 시도" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("formats numeric strings from the PD-L1 JSON payload", () => {
    render(
      <Pdl1ResultPanel
        aiResult={{
          result_detail: {
            pdl1: {
              confidence: "0.8",
              probabilities: { class_0: "0.1", class_1: "0.8", class_2: "0.1" },
            },
          },
        }}
      />,
    );

    expect(screen.getAllByText("80.00%").length).toBeGreaterThan(0);
  });
});
