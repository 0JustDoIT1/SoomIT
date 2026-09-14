import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { PathologyShell } from "./pathology-shell";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  sessionStorage.clear();
  replace.mockClear();
});

it("shows the stored staff identity and uses the existing session logout flow", async () => {
  sessionStorage.setItem("accessToken", "access");
  sessionStorage.setItem("refreshToken", "refresh");
  sessionStorage.setItem("user", JSON.stringify({ name: "김병리" }));

  render(
    <PathologyShell>
      <div>content</div>
    </PathologyShell>,
  );

  expect(screen.getByText("김병리")).toBeInTheDocument();
  expect(screen.getByText("임상병리사")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));

  expect(sessionStorage.getItem("accessToken")).toBeNull();
  expect(sessionStorage.getItem("refreshToken")).toBeNull();
  expect(sessionStorage.getItem("user")).toBeNull();
  expect(replace).toHaveBeenCalledWith("/login");
});
