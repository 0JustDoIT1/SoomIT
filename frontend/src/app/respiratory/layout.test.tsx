import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import Layout from "./layout";

const { push, fetchMock } = vi.hoisted(() => ({ push: vi.fn(), fetchMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/respiratory/dashboard" }));
vi.mock("./_components/respiratory-auth-provider", () => ({
  RespiratoryAuthProvider: ({ children }: { children: ReactNode }) => children,
  useRespiratoryAuth: () => ({ user: { id: "doctor" }, authorizedFetch: fetchMock, isReady: true, isAuthenticated: true, logout: vi.fn() }),
}));
vi.mock("@/components/theme/clinician-theme-toggle", () => ({ ClinicianThemeToggle: () => null }));
vi.mock("@/components/chat/SoomChatPanel", () => ({ SoomChatPanel: () => null }));

beforeEach(() => { localStorage.clear(); push.mockClear(); fetchMock.mockReset(); });

it("navigates on the first click while the Case list is still pending", () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  render(<Layout>home</Layout>);
  const before = fetchMock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Case" }));
  expect(push).toHaveBeenCalledWith("/respiratory/cases");
  expect(fetchMock).toHaveBeenCalledTimes(before);
});

it("opens the last assigned Case from the loaded list without another request", async () => {
  localStorage.setItem("respiratory-last-case-id", "case-b");
  fetchMock.mockImplementation(async () => new Response(JSON.stringify([{ id: "case-a" }, { id: "case-b" }])));
  await act(async () => { render(<Layout>home</Layout>); });
  const before = fetchMock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Case" }));
  expect(push).toHaveBeenCalledExactlyOnceWith("/respiratory/cases/case-b");
  expect(fetchMock).toHaveBeenCalledTimes(before);
});
