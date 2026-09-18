import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExaminationOrder } from "../../_lib/respiratory-api";
import { StageExaminationOrder } from "./stage-examination-order";

const authorizedFetch = vi.fn();
vi.mock("../../_components/respiratory-auth-provider", () => ({ useRespiratoryAuth: () => ({ authorizedFetch }) }));
vi.mock("../../_lib/respiratory-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../_lib/respiratory-api")>()), createExaminationOrder: vi.fn() }));

const createOrderMock = vi.mocked(createExaminationOrder);

describe("StageExaminationOrder", () => {
  beforeEach(() => {
    authorizedFetch.mockReset();
    createOrderMock.mockReset();
    createOrderMock.mockResolvedValue({ id: "order-1", case_id: "case-1", order_type: "CT", order_type_label: "흉부 CT", priority: "URGENT", status: "ORDERED", created_at: "2026-09-18T00:00:00Z" });
  });

  it("reviews and creates only the contextual next examination order", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<StageExaminationOrder caseId="case-1" orderType="CT" onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: "흉부 CT 오더" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "검사 오더 우선순위" }), "URGENT");
    await user.type(screen.getByRole("textbox", { name: "검사 오더 목적" }), "흉부 병변 추가 평가");
    await user.click(screen.getByRole("button", { name: "입력 내용 검토" }));
    expect(createOrderMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "오더 확정" }));

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledWith(authorizedFetch, "case-1", { order_type: "CT", priority: "URGENT", purpose: "흉부 병변 추가 평가", clinical_note: "" }));
    expect(onCreated).toHaveBeenCalledWith("CT");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the server validation response without closing the order dialog", async () => {
    createOrderMock.mockRejectedValue(new Error("선행 검사의 전문과 확정 결과가 필요합니다."));
    const user = userEvent.setup();
    render(<StageExaminationOrder caseId="case-1" orderType="PET_CT_TNM" />);

    await user.click(screen.getByRole("button", { name: "PET-CT / TNM 병기 오더" }));
    await user.type(screen.getByRole("textbox", { name: "검사 오더 목적" }), "병기 평가");
    await user.click(screen.getByRole("button", { name: "입력 내용 검토" }));
    await user.click(screen.getByRole("button", { name: "오더 확정" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("선행 검사의 전문과 확정 결과가 필요합니다.");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("returns focus to the trigger when Escape closes the dialog", async () => {
    const user = userEvent.setup();
    render(<StageExaminationOrder caseId="case-1" orderType="CT" />);
    const trigger = screen.getByRole("button", { name: "흉부 CT 오더" });

    await user.click(trigger);
    expect(screen.getByRole("dialog").querySelector("section")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });
});
