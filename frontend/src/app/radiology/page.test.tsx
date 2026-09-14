import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "./page";
import { RadiologyWorklist } from "./_components/radiology-worklist";
import { fetchRadiologyCaseWorkflow, fetchRadiologyCaseWorklist } from "./_lib/radiology-api";
beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });

it("reopens a restored recent case absent from the worklist without auto-selection", async () => {
  sessionStorage.setItem("accessToken", "test");
  sessionStorage.setItem("radiologyRecentPatients", JSON.stringify([{ case_id: "old", patient_name: "Recent", birth_date: "2000-01-01" }]));
  vi.mocked(fetchRadiologyCaseWorklist).mockResolvedValue([]);
  vi.mocked(fetchRadiologyCaseWorkflow).mockResolvedValue({ exams: [] } as unknown as Awaited<ReturnType<typeof fetchRadiologyCaseWorkflow>>);
  render(<Page />);
  const button = await screen.findByRole("button", { name: /Recent/ });
  expect(fetchRadiologyCaseWorkflow).not.toHaveBeenCalled();
  await userEvent.click(button);
  await screen.findByText("표시할 영상 검사가 없습니다.");
  expect(fetchRadiologyCaseWorkflow).toHaveBeenCalledWith("old", expect.any(AbortSignal));
  expect(button).toHaveAttribute("aria-pressed", "true");
});

vi.mock("./_lib/radiology-api", () => ({
  fetchRadiologyCaseWorklist: vi.fn(), fetchRadiologyCaseWorkflow: vi.fn(),
  RadiologyApiError: class extends Error {},
}));
vi.mock("./_components/radiology-detail", () => ({
  RadiologyPatientSummary: ({ item }: { item: { id: string } }) => <div>summary-{item.id}</div>,
  RadiologyDetail: () => <div>exam-detail</div>,
}));

it("preserves selected case, summary and workflow through all pagination controls", async () => {
  sessionStorage.setItem("accessToken", "test");
  const rows = Array.from({ length: 21 }, (_, i) => ({
    case: { id: String(i) }, patient: { name: `patient-${i}`, patient_code: `code-${i}` },
    current_exam: { id: String(i), examination_order: { exam_type_label: "CT" } },
    workflow_status: "EXAM_PENDING",
  }));
  vi.mocked(fetchRadiologyCaseWorklist).mockResolvedValue(rows as unknown as Awaited<ReturnType<typeof fetchRadiologyCaseWorklist>>);
  vi.mocked(fetchRadiologyCaseWorkflow).mockResolvedValue({ exams: [] } as unknown as Awaited<ReturnType<typeof fetchRadiologyCaseWorkflow>>);
  const user = userEvent.setup();
  render(<Page />);
  await user.click(await screen.findByText("patient-0"));
  const detail = await screen.findByText("표시할 영상 검사가 없습니다.");
  for (const button of ["2", "다음", "이전", "1"]) {
    await user.click(screen.getByRole("button", { name: button }));
    expect(screen.getByText("summary-0")).toBeInTheDocument();
    expect(detail).toBeInTheDocument();
  }
  expect(screen.getAllByText("patient-0").find(el => el.closest("tr"))?.closest("tr")).toHaveAttribute("aria-selected", "true");
  expect(fetchRadiologyCaseWorkflow).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "2" }));
  await user.click(screen.getByText("patient-10"));
  expect(screen.getByText("summary-10")).toBeInTheDocument();
  await waitFor(() => expect(fetchRadiologyCaseWorkflow).toHaveBeenCalledTimes(2));
});

it("shows ten skeleton rows on initial fetch and ends loading on error", async () => {
  sessionStorage.setItem("accessToken", "test");
  let rejectRequest: ((e: Error) => void) | undefined;
  vi.mocked(fetchRadiologyCaseWorklist).mockImplementation(() => new Promise((_, reject) => { rejectRequest = reject; }));
  render(<Page />);
  expect(screen.getByText("Worklist 로딩 중")).toHaveAttribute("role", "status");
  expect(document.querySelectorAll('tr[aria-hidden="true"]')).toHaveLength(10);
  await waitFor(() => expect(rejectRequest).toBeDefined());
  await act(async () => rejectRequest?.(new Error("test-error")));
  expect(await screen.findByText("test-error")).toBeInTheDocument();
  expect(document.querySelectorAll('tr[aria-hidden="true"]')).toHaveLength(0);
});

it("replaces existing rows only while the worklist is loading", () => {
  render(<RadiologyWorklist items={[]} selectedId="selected-case" onSelect={vi.fn()}
    viewStatus="loading" errorMessage="" filters={{}} onFiltersChange={vi.fn()}
    currentPage={2} totalPages={3} totalItems={21} onPageChange={vi.fn()} />);
  expect(document.querySelectorAll('tbody tr')).toHaveLength(10);
  expect(screen.queryByText("Worklist를 불러오는 중입니다.")).not.toBeInTheDocument();
});
