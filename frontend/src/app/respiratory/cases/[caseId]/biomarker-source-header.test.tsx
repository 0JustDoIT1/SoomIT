import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BiomarkerSourceHeader } from "./biomarker-source-header";

describe("BiomarkerSourceHeader", () => {
  it("identifies confirmed, AI and unavailable-auth sources separately", () => {
    render(<BiomarkerSourceHeader />);

    const sources = screen.getByLabelText("PD-L1 결과 출처");
    expect(sources).toHaveTextContent("전문과 확정");
    expect(sources).toHaveTextContent("AI 분석 후보");
    expect(sources).toHaveTextContent("인증 연동 대기");
    expect(screen.getByText("전문과 확정 TPS와 PD-L1 AI 예측 구간을 출처별로 구분해 확인합니다.")).toBeTruthy();
  });
});
