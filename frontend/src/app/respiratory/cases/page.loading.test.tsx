import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Page from "./page";

const { fetchMock, push } = vi.hoisted(() => ({ fetchMock: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/respiratory/dashboard", useRouter: () => ({ push }) }));
vi.mock("../_components/respiratory-auth-provider", () => ({ useRespiratoryAuth: () => ({ authorizedFetch: fetchMock, user: { id: "doctor" } }) }));
vi.mock("../dashboard/dashboard-assistant", () => ({ DashboardAssistant: () => null }));
vi.mock("../dashboard/dashboard-work-queues", () => ({ DashboardWorkQueues: ({ snapshots, snapshotLoadError, onRetrySnapshots }: { snapshots: Record<string, unknown>; snapshotLoadError?: boolean; onRetrySnapshots?: () => void }) => <div>{Object.keys(snapshots).map(id => <span key={id}>loaded-{id}</span>)}{snapshotLoadError && <button onClick={onRetrySnapshots}>snapshot-error</button>}</div> }));

it("renders a completed case snapshot without waiting for a slower case", async () => {
  let finishSlow!: (response: Response) => void;
  const slow = new Promise<Response>(resolve => { finishSlow = resolve; });
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/doctor/cases/")) return new Response(JSON.stringify(["fast", "slow"].map(id => ({ id, patient_name: id, case_code: id, patient_code: id, current_stage: "CT", case_status: "ACTIVE", updated_at: "v1" }))));
    if (url.includes("/slow/ai-results/")) return slow;
    return new Response("[]");
  });
  render(<Page />);
  expect(await screen.findByText("loaded-fast")).toBeInTheDocument();
  expect(screen.queryByText("loaded-slow")).not.toBeInTheDocument();
  await act(async () => finishSlow(new Response("[]")));
  await waitFor(() => expect(screen.getByText("loaded-slow")).toBeInTheDocument());
});

it("exposes a retry when a Case snapshot request fails", async () => {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => String(input).endsWith("/api/doctor/cases/")
    ? new Response(JSON.stringify([{ id: "failed", patient_name: "failed", case_code: "failed", patient_code: "failed", current_stage: "CT", case_status: "ACTIVE", updated_at: "v1" }]))
    : new Response("{}", { status: 500 }));
  render(<Page />);
  const retry = await screen.findByRole("button", { name: "snapshot-error" });
  const before = fetchMock.mock.calls.length;
  fireEvent.click(retry);
  await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
});
