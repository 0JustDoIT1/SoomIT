import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Pdl1ConfirmationButton } from "./pdl1-confirmation-button";

const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast/toast", () => ({ showToast: toast }));

describe("Pdl1ConfirmationButton", () => {
  beforeEach(() => Object.values(toast).forEach((mock) => mock.mockReset()));

  it("requires and submits an exact clinician TPS separately from the AI range", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response("{}"));
    const onConfirmed = vi.fn();
    render(<Pdl1ConfirmationButton caseId="case-1" resultId="result-1" aiRange="<1%" apiBaseUrl="http://test" authorizedFetch={authorizedFetch} onConfirmed={onConfirmed} />);

    fireEvent.click(screen.getByRole("button", { name: "결과 확인 및 확정" }));
    expect(screen.getByText("<1%")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "PD-L1 결과 확정" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("PD-L1 최종 TPS"), { target: { value: "0.5" } });
    fireEvent.click(submit);

    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith(
      "http://test/api/doctor/cases/case-1/clinical-results/pathology/result-1/confirm/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tps_percent: 0.5, indeterminate_reason: "" }),
      }),
    ));
    expect(onConfirmed).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("requires a reason when the result is indeterminate", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response("{}"));
    render(<Pdl1ConfirmationButton caseId="case-1" resultId="result-1" aiRange="1-49%" apiBaseUrl="http://test" authorizedFetch={authorizedFetch} onConfirmed={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "결과 확인 및 확정" }));
    fireEvent.click(screen.getByRole("radio", { name: "판정 불가" }));
    const submit = screen.getByRole("button", { name: "PD-L1 결과 확정" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("PD-L1 판정 불가 사유"), { target: { value: "검체 부족으로 판정 불가" } });
    fireEvent.click(submit);

    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/confirm/"),
      expect.objectContaining({ body: JSON.stringify({ tps_percent: null, indeterminate_reason: "검체 부족으로 판정 불가" }) }),
    ));
  });
});
