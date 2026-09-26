import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RespiratoryHelpPage from "./page";

describe("RespiratoryHelpPage", () => {
  it("provides workflow guidance, safety context, and operational shortcuts", () => {
    render(<RespiratoryHelpPage />);

    expect(screen.getByRole("heading", { name: "호흡기내과 도움말" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "진료 단계 한눈에 보기" })).toBeInTheDocument();
    expect(screen.getByText("Safety Check 후 최종 확정")).toBeInTheDocument();
    expect(screen.getByText("환자 안전 원칙")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /오늘 업무 시작/ })).toHaveAttribute("href", "/respiratory/dashboard");
    expect(screen.getByRole("link", { name: /협진 요청 확인/ })).toHaveAttribute("href", "/respiratory/consultations");
  });

  it("filters help topics without hiding the workflow overview", () => {
    render(<RespiratoryHelpPage />);

    fireEvent.change(screen.getByRole("searchbox", { name: "도움말 검색" }), { target: { value: "병변" } });
    expect(screen.getByText("대시보드 병변 표시는 무엇을 의미하나요?")).toBeInTheDocument();
    expect(screen.queryByText("협진과 알림은 어떻게 사용하나요?")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "진료 단계 한눈에 보기" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "도움말 검색" }), { target: { value: "없는질문" } });
    expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();
  });
});
