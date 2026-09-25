import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { DecisionModal } from "./decision-ui";
import { resultStatusLabel } from "./decision-status-labels";

it("restores focus to the entry button after Escape closes the modal", () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>결과 입력 및 처리</button>{open && <DecisionModal title="결과 처리" busy={false} primaryLabel="Case 종료" onClose={() => setOpen(false)} onSubmit={vi.fn()}><label>소견<input /></label></DecisionModal>}</>;
  }
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "결과 입력 및 처리" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog")).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("uses one primary action and locks input, cancel and Escape while busy", () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  render(<DecisionModal title="결과 처리" busy error="이전 오류" primaryLabel="Case 종료" onClose={onClose} onSubmit={onSubmit}><label>소견<input /></label></DecisionModal>);
  expect(screen.getAllByRole("button")).toHaveLength(3);
  expect(screen.getByLabelText("소견")).toBeDisabled();
  expect(screen.getByRole("button", { name: "처리 중" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("이전 오류");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});

it.each([["CONFIRMED", "완료"], ["DRAFT", "입력 중"], ["RUNNING", "처리 중"], ["FAILED", "실패"], ["INTERNAL_UNKNOWN", "검토 필요"], [undefined, "결과 대기"]])("translates %s without exposing workflow enums", (input, expected) => {
  expect(resultStatusLabel(input)).toBe(expected);
});
