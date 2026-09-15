import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaseCoordinationPanels } from "./case-coordination-panels";
import { createExaminationOrder, fetchExaminationOrders } from "../../_lib/respiratory-api";

const authorizedFetch = vi.fn();
vi.mock("../../_components/respiratory-auth-provider", () => ({ useRespiratoryAuth: () => ({ authorizedFetch }) }));
vi.mock("../../_lib/respiratory-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../_lib/respiratory-api")>()), fetchExaminationOrders: vi.fn(), createExaminationOrder: vi.fn() }));
const fetchOrdersMock = vi.mocked(fetchExaminationOrders);
const createOrderMock = vi.mocked(createExaminationOrder);

describe("CaseCoordinationPanels", () => {
  beforeEach(() => {
    authorizedFetch.mockReset(); fetchOrdersMock.mockReset(); createOrderMock.mockReset();
    fetchOrdersMock.mockResolvedValue([]);
    createOrderMock.mockResolvedValue({ id: "order-1", case_id: "case-1", order_type: "PET_CT_TNM", order_type_label: "PET-CT 및 TNM 병기 평가", priority: "URGENT", status: "ORDERED", created_at: "2026-09-15T00:00:00Z" });
  });

  it("keeps clinician decision saving disabled without its API", async () => {
    render(<CaseCoordinationPanels caseId="case-1" />);
    expect(await screen.findByText("저장 API 연동 대기")).toBeTruthy();
    expect(screen.getByRole("button", { name: "결정 저장" })).toBeDisabled();
  });

  it("reviews then creates a PET-CT/TNM order with the common API", async () => {
    const user = userEvent.setup(); render(<CaseCoordinationPanels caseId="case-1" />);
    await user.click(await screen.findByRole("button", { name: "오더 작성 시작" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "검사 종류" }), "PET_CT_TNM");
    await user.selectOptions(screen.getByRole("combobox", { name: "우선순위" }), "URGENT");
    await user.type(screen.getByRole("textbox", { name: "검사 목적" }), "TNM 병기 평가");
    await user.click(screen.getByRole("button", { name: "입력 내용 검토" }));
    expect(createOrderMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "오더 확정" }));
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledWith(authorizedFetch, "case-1", { order_type: "PET_CT_TNM", priority: "URGENT", purpose: "TNM 병기 평가", clinical_note: "" }));
    expect(screen.getByLabelText("생성된 검사 오더")).toHaveTextContent("PET-CT 및 TNM 병기 평가");
  });

  it("prevents client-side duplicate requests for ORDERED or SCHEDULED orders", async () => {
    fetchOrdersMock.mockResolvedValue([{ id: "order-1", case_id: "case-1", order_type: "CT", order_type_label: "CT", priority: "NORMAL", status: "ORDERED", purpose: "CT", created_at: "2026-09-15T00:00:00Z" }]);
    const user = userEvent.setup(); render(<CaseCoordinationPanels caseId="case-1" />);
    await user.click(await screen.findByRole("button", { name: "오더 작성 시작" }));
    await user.type(screen.getByRole("textbox", { name: "검사 목적" }), "흉부 CT");
    expect(screen.getByText("동일 종류의 요청됨·예약됨 오더가 이미 있어 중복 요청할 수 없습니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "입력 내용 검토" })).toBeDisabled();
  });

  it("shows the server prerequisite failure without inventing a client result", async () => {
    createOrderMock.mockRejectedValue(new Error("CT 전문의 확정 결과가 있어야 PET-CT 및 TNM 병기 평가 오더를 생성할 수 있습니다."));
    const user = userEvent.setup(); render(<CaseCoordinationPanels caseId="case-1" />);
    await user.click(await screen.findByRole("button", { name: "오더 작성 시작" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "검사 종류" }), "PET_CT_TNM");
    await user.type(screen.getByRole("textbox", { name: "검사 목적" }), "TNM 병기 평가");
    await user.click(screen.getByRole("button", { name: "입력 내용 검토" }));
    await user.click(screen.getByRole("button", { name: "오더 확정" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("CT 전문의 확정 결과가 있어야");
  });
});
