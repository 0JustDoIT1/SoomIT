import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RespiratoryAuthProvider, useRespiratoryAuth } from "./respiratory-auth-provider";
import { staffAuthenticatedFetch } from "../../../lib/api";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("../../../lib/api", () => ({
  staffAuthenticatedFetch: vi.fn(),
}));

const authenticatedFetchMock = vi.mocked(staffAuthenticatedFetch);

function Consumer() {
  const { authorizedFetch, isReady } = useRespiratoryAuth();

  return (
    <button
      type="button"
      disabled={!isReady}
      onClick={() => authorizedFetch("/api/doctor/cases/")}
    >
      Case 조회
    </button>
  );
}

describe("RespiratoryAuthProvider", () => {
  beforeEach(() => {
    sessionStorage.clear();
    replace.mockReset();
    authenticatedFetchMock.mockReset();
    authenticatedFetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    sessionStorage.setItem("accessToken", "access-token");
    sessionStorage.setItem(
      "user",
      JSON.stringify({
        id: "doctor-1",
        username: "doctor",
        name: "담당의",
        role: "DOCTOR",
        department: { id: "dept-1", code: "PULMONOLOGY", name: "호흡기내과" },
        hospital: { id: "hospital-1", code: "H001", name: "테스트 병원" },
      }),
    );
  });

  it("공통 JWT API 클라이언트로 호흡기내과 요청을 위임한다", async () => {
    const user = userEvent.setup();
    render(
      <RespiratoryAuthProvider>
        <Consumer />
      </RespiratoryAuthProvider>,
    );

    const button = await screen.findByRole("button", { name: "Case 조회" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/api/doctor/cases/",
      expect.objectContaining({ cache: "no-store" }),
    );
    const requestInit = authenticatedFetchMock.mock.calls[0][1];
    expect(new Headers(requestInit?.headers).get("Accept")).toBe("application/json");
  });
});
