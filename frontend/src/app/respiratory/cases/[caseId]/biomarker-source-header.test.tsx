import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BiomarkerSourceHeader } from "./biomarker-source-header";

describe("BiomarkerSourceHeader", () => {
  it("identifies confirmed and AI sources separately", () => {
    render(<BiomarkerSourceHeader />);

    const sources = screen.getByLabelText("PD-L1 결과 출처");
    expect(sources).toHaveTextContent("병리과 검토");
    expect(sources).toHaveTextContent("AI 분석 후보");
    expect(sources).not.toHaveTextContent("인증 연동 대기");
    expect(screen.getByText("병리과 검토 TPS와 PD-L1 AI 예측 구간을 구분해 확인하며, 호흡기내과 확정 후 최종 TPS를 표시합니다.")).toBeTruthy();
  });
});
