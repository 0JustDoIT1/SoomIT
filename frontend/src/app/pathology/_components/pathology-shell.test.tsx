import { render, screen, within } from "@testing-library/react";
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

  const rail = screen.getByRole("complementary", { name: "병리과 사이드 레일" });
  expect(within(rail).getByRole("img", { name: "SoomIT" })).toBeInTheDocument();
  expect(within(rail).queryByRole("button")).not.toBeInTheDocument();
  expect(rail).toHaveClass("h-dvh", "w-[60px]", "lg:w-[76px]", "bg-[#17233F]");
  expect(screen.getByText("김병리")).toBeInTheDocument();
  expect(screen.getByText("병리검사 업무")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));

  expect(sessionStorage.getItem("accessToken")).toBeNull();
  expect(sessionStorage.getItem("refreshToken")).toBeNull();
  expect(sessionStorage.getItem("user")).toBeNull();
  expect(replace).toHaveBeenCalledWith("/login");
});
