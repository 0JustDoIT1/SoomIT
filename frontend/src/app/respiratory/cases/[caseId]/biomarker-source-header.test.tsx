import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BiomarkerSourceHeader } from "./biomarker-source-header";

describe("BiomarkerSourceHeader", () => {
  it("identifies confirmed, AI and unavailable-auth sources separately", () => {
    render(<BiomarkerSourceHeader />);

    const sources = screen.getByLabelText("바이오마커 결과 출처");
    expect(sources).toHaveTextContent("전문과 확정");
    expect(sources).toHaveTextContent("AI 분석 후보");
    expect(sources).toHaveTextContent("인증 연동 대기");
    expect(screen.getByText("전문과 확정 결과와 AI 분석 후보를 출처별로 구분해 확인합니다.")).toBeTruthy();
  });
});
