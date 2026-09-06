import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PathologyAuthProvider,
  usePathologyAuth,
} from "./pathology-auth-provider";

function AuthHarness() {
  const auth = usePathologyAuth();
  const [message, setMessage] = useState("");

  return (
    <div>
      <input
        aria-label="비밀번호"
        value={auth.password}
        onChange={(event) => auth.setPassword(event.target.value)}
      />
      <button type="button" onClick={auth.markConnected}>
        연결 표시
      </button>
      <button
        type="button"
        onClick={() => {
          void auth.authorizedFetch("http://api.test/").catch((error: unknown) => {
            setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
          });
        }}
      >
        요청
      </button>
      <span data-testid="connection">{auth.isConnected ? "연결됨" : "연결 안 됨"}</span>
      <p>{message}</p>
    </div>
  );
}

function renderAuthHarness() {
  render(
    <PathologyAuthProvider>
      <AuthHarness />
    </PathologyAuthProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PathologyAuthProvider", () => {
  it("clears the password and connection after a 401 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const user = userEvent.setup();
    renderAuthHarness();

    await user.type(screen.getByLabelText("비밀번호"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "연결 표시" }));
    await user.click(screen.getByRole("button", { name: "요청" }));

    expect(await screen.findByText(/인증 정보가 올바르지 않거나 만료/)).toBeInTheDocument();
    expect(screen.getByLabelText("비밀번호")).toHaveValue("");
    expect(screen.getByTestId("connection")).toHaveTextContent("연결 안 됨");
  });

  it("keeps the connection after a 403 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    const user = userEvent.setup();
    renderAuthHarness();

    await user.type(screen.getByLabelText("비밀번호"), "test-password");
    await user.click(screen.getByRole("button", { name: "연결 표시" }));
    await user.click(screen.getByRole("button", { name: "요청" }));

    expect(await screen.findByText(/접근할 권한이 없습니다/)).toBeInTheDocument();
    expect(screen.getByLabelText("비밀번호")).toHaveValue("test-password");
    expect(screen.getByTestId("connection")).toHaveTextContent("연결됨");
  });

  it("distinguishes a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const user = userEvent.setup();
    renderAuthHarness();

    await user.type(screen.getByLabelText("비밀번호"), "test-password");
    await user.click(screen.getByRole("button", { name: "요청" }));

    expect(await screen.findByText(/병리 API 서버에 연결할 수 없습니다/)).toBeInTheDocument();
  });
});
