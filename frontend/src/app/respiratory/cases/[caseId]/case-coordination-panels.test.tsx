import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaseCoordinationPanels } from "./case-coordination-panels";
import { createFollowUpPathologyOrder, fetchFollowUpPathologyOrderAvailability } from "../../_lib/respiratory-api";

const authorizedFetch = vi.fn();

vi.mock("../../_components/respiratory-auth-provider", () => ({
  useRespiratoryAuth: () => ({ authorizedFetch }),
}));

vi.mock("../../_lib/respiratory-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../_lib/respiratory-api")>();
  return {
    ...actual,
    fetchFollowUpPathologyOrderAvailability: vi.fn(),
    createFollowUpPathologyOrder: vi.fn(),
  };
});

const fetchAvailabilityMock = vi.mocked(fetchFollowUpPathologyOrderAvailability);
const createOrderMock = vi.mocked(createFollowUpPathologyOrder);

describe("CaseCoordinationPanels", () => {
  beforeEach(() => {
    authorizedFetch.mockReset();
    fetchAvailabilityMock.mockReset();
    createOrderMock.mockReset();
    fetchAvailabilityMock.mockResolvedValue({
      subtype_review_completed: true,
      active_orders: { PDL1: false, GENE: false },
    });
    createOrderMock.mockResolvedValue({
      examination_order_id: "order-1",
      pathology_work_item_id: "work-1",
      pathology_test_type: "PDL1",
      pathology_test_type_label: "PD-L1 검사",
      order_status: "ORDERED",
      created_at: "2026-09-13T00:00:00Z",
    });
  });

  it("keeps unsupported clinician decision controls disabled", async () => {
    render(<CaseCoordinationPanels caseId="case-1" />);

    expect(await screen.findByText("저장 API 연동 대기")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "진행 결정" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "다음 단계" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "판단 근거" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "환자에게 보여줄 설명" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "환자에게 공개" })).toBeDisabled();
    expect(screen.getByText("환자 공개 API 연동 대기")).toBeTruthy();
    expect(screen.getByRole("button", { name: "결정 저장" })).toBeDisabled();
  });

  it("does not create an order until the clinician reviews and confirms it", async () => {
    const user = userEvent.setup();
    render(<CaseCoordinationPanels caseId="case-1" />);

    await user.click(await screen.findByRole("button", { name: "오더 작성 시작" }));
    const reviewButton = screen.getByRole("button", { name: "입력 내용 검토" });
    expect(reviewButton).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /검사 목적/ }), "치료 결정을 위한 발현 확인");
    await user.type(screen.getByRole("textbox", { name: "임상 소견" }), "확정 병리 결과 참고");
    await user.selectOptions(screen.getByRole("combobox", { name: "우선순위" }), "URGENT");
    await user.click(reviewButton);

    expect(createOrderMock).not.toHaveBeenCalled();
    expect(screen.getByText("오더 최종 확인")).toBeTruthy();
    expect(screen.getByText("치료 결정을 위한 발현 확인")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "오더 확정" }));
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledWith(authorizedFetch, "case-1", {
      pathology_test_type: "PDL1",
      priority: "URGENT",
      purpose: "치료 결정을 위한 발현 확인",
      clinical_note: "확정 병리 결과 참고",
    }));
    expect(screen.getByLabelText("생성된 검사 오더")).toHaveTextContent("PD-L1 검사");
    expect(screen.getByLabelText("생성된 검사 오더")).toHaveTextContent("요청됨");
    expect(screen.getByLabelText("생성된 검사 오더")).toHaveTextContent("order-1");
  });

  it("blocks ordering before the subtype result is confirmed", async () => {
    fetchAvailabilityMock.mockResolvedValue({
      subtype_review_completed: false,
      active_orders: { PDL1: false, GENE: false },
    });
    render(<CaseCoordinationPanels caseId="case-1" />);

    expect(await screen.findByText("아형 분류 결과가 확정된 뒤 추가 검사를 요청할 수 있습니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "오더 작성 시작" })).toBeDisabled();
  });

  it("blocks a duplicate active order of the selected type", async () => {
    fetchAvailabilityMock.mockResolvedValue({
      subtype_review_completed: true,
      active_orders: { PDL1: true, GENE: false },
    });
    render(<CaseCoordinationPanels caseId="case-1" />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "오더 작성 시작" }));
    expect(await screen.findByText("동일 종류의 미완료 오더가 이미 있어 중복 요청할 수 없습니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "입력 내용 검토" })).toBeDisabled();
  });
});
