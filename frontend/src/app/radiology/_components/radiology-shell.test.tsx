import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RadiologyShell } from "./radiology-shell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/ui/toast/toast", () => ({ showToast: { dismiss: vi.fn() } }));
vi.mock("@/components/theme/clinician-theme-toggle", () => ({ ClinicianThemeToggle: () => null }));

describe("RadiologyShell", () => {
  it("places the full-height narrow brand rail beside the header and page content", () => {
    render(<RadiologyShell><div>workstation content</div></RadiologyShell>);
    const rail = screen.getByRole("complementary", { name: "영상의학과 사이드 레일" });
    expect(within(rail).getByRole("img", { name: "SoomIT" })).toBeInTheDocument();
    expect(within(rail).queryByRole("button")).not.toBeInTheDocument();
    expect(rail).toHaveClass("h-dvh", "w-[60px]", "lg:w-[76px]", "bg-[#17233F]");
    expect(screen.getByText("Radiology Workstation")).toBeInTheDocument();
    expect(screen.getByText("workstation content")).toBeInTheDocument();
  });
});
