import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ClinicianThemeToggle } from "./clinician-theme-toggle";
import { CLINICIAN_THEME_STORAGE_KEY } from "./clinician-theme";

describe("ClinicianThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.documentElement.classList.remove("dark");
  });

  it("switches between dark and light while persisting the preference", () => {
    render(<ClinicianThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "다크 모드로 전환" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem(CLINICIAN_THEME_STORAGE_KEY)).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "라이트 모드로 전환" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(CLINICIAN_THEME_STORAGE_KEY)).toBe("light");
  });

  it("reflects a dark preference applied before hydration", () => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.classList.add("dark");
    render(<ClinicianThemeToggle />);
    expect(screen.getByRole("button", { name: "라이트 모드로 전환" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps open clinician screens synchronized with a stored preference", () => {
    render(<ClinicianThemeToggle />);
    fireEvent(window, new StorageEvent("storage", { key: CLINICIAN_THEME_STORAGE_KEY, newValue: "dark" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "라이트 모드로 전환" })).toBeInTheDocument();
  });
});
