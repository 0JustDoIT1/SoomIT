import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createExaminationOrder } from "../../_lib/respiratory-api";
import { StageExaminationOrder } from "./stage-examination-order";

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }));
const authorizedFetch = vi.fn();
vi.mock("@/components/ui/toast/toast", () => ({ showToast: toastMocks }));
vi.mock("../../_components/respiratory-auth-provider", () => ({ useRespiratoryAuth: () => ({ authorizedFetch }) }));
vi.mock("../../_lib/respiratory-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../_lib/respiratory-api")>()), createExaminationOrder: vi.fn() }));

const createOrderMock = vi.mocked(createExaminationOrder);

describe("StageExaminationOrder", () => {
  beforeEach(() => {
    authorizedFetch.mockReset();
    Object.values(toastMocks).forEach((mock) => mock.mockReset());
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
    expect(toastMocks.info).toHaveBeenCalledWith("검사 오더를 처리하고 있습니다.", { id: "case-order-case-1-CT" });
    expect(toastMocks.success).toHaveBeenCalledWith("흉부 CT 검사 오더가 생성되었습니다.", { id: "case-order-case-1-CT" });
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

    expect(await screen.findByRole("alert")).toHaveTextContent("검사 오더 생성에 실패했습니다.");
    expect(toastMocks.error).toHaveBeenCalledWith("검사 오더 생성에 실패했습니다.", { id: "case-order-case-1-PET_CT_TNM" });
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

  it("prevents duplicate order requests while creation is in progress", async () => {
    let resolveOrder!: (value: Awaited<ReturnType<typeof createExaminationOrder>>) => void;
    createOrderMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOrder = resolve; }));
    render(<StageExaminationOrder caseId="case-1" orderType="PDL1" />);

    fireEvent.click(screen.getByRole("button", { name: "PD-L1 오더" }));
    fireEvent.change(screen.getByRole("textbox", { name: "검사 오더 목적" }), { target: { value: "PD-L1 평가" } });
    fireEvent.click(screen.getByRole("button", { name: "입력 내용 검토" }));
    const submit = screen.getByRole("button", { name: "오더 확정" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(createOrderMock).toHaveBeenCalledOnce();
    expect(toastMocks.info).toHaveBeenCalledOnce();
    resolveOrder({ id: "order-1", case_id: "case-1", order_type: "PDL1", order_type_label: "PD-L1", priority: "NORMAL", status: "ORDERED", created_at: "2026-09-19T00:00:00Z" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
