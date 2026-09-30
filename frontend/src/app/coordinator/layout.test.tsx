import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import CoordinatorLayout from "./layout";

vi.mock("next/navigation", () => ({ usePathname: () => "/coordinator/patients", useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/ui/toast/toast", () => ({ showToast: { dismiss: vi.fn() } }));
vi.mock("@/components/theme/clinician-theme-toggle", () => ({ ClinicianThemeToggle: () => null }));

beforeEach(() => {
  sessionStorage.setItem("user", JSON.stringify({ name: "원무 담당자" }));
});

it("renders the compact brand rail with the existing coordinator tabs and content", () => {
  render(<CoordinatorLayout><div>Patient Coordination content</div></CoordinatorLayout>);
  const rail = screen.getByRole("complementary", { name: "원무과 사이드 레일" });
  expect(within(rail).getByRole("img", { name: "SoomIT" })).toBeInTheDocument();
  expect(within(rail).queryByRole("button")).not.toBeInTheDocument();
  expect(rail).toHaveClass("h-dvh", "w-[60px]", "lg:w-[76px]", "bg-[#17233F]");
  expect(screen.getByText("Patient Coordination")).toBeInTheDocument();
  const activeTab = screen.getByRole("link", { name: "환자 관리" });
  expect(activeTab).toBeInTheDocument();
  expect(activeTab).toHaveClass("text-[#C9829B]");
  expect(activeTab.querySelector("span")).toHaveClass("bg-[#C9829B]");
  expect(screen.getByRole("navigation").parentElement).toHaveClass("bg-[#F8F1F4]", "border-[#E2E8F0]");
  expect(screen.getByText("Patient Coordination content")).toBeInTheDocument();
});
