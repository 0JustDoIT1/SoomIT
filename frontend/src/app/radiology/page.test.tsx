import { act, render, screen, waitFor, within } from "@testing-library/react";
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
  fetchRadiologyCaseWorklist: vi.fn(), fetchRadiologyCaseWorkflow: vi.fn(), fetchRadiologyCompletedExams: vi.fn(),
  RadiologyApiError: class extends Error {},
}));
vi.mock("./_components/radiology-detail", () => ({
  RadiologyPatientSummary: ({ item }: { item: { id: string } }) => <div>summary-{item.id}</div>,
  RadiologyDetail: ({ onImageUploaded }: { onImageUploaded?: () => void }) => (
    <button type="button" onClick={onImageUploaded}>uploaded-image</button>
  ),
}));

it("refetches the selected case workflow after an image upload", async () => {
  sessionStorage.setItem("accessToken", "test");
  const row = {
    case: { id: "case-1" }, patient: { name: "patient-1", patient_code: "code-1" },
    current_exam: { id: "order-1", examination_order: { order_type_label: "XRAY" } },
    workflow_status: "EXAM_PENDING",
  };
  vi.mocked(fetchRadiologyCaseWorklist).mockResolvedValue([row] as unknown as Awaited<ReturnType<typeof fetchRadiologyCaseWorklist>>);
  vi.mocked(fetchRadiologyCaseWorkflow).mockResolvedValue({
    patient: row.patient,
    case: row.case,
    responsible_doctor: null,
    exams: [{
      ...row.current_exam,
      patient: row.patient,
      case: row.case,
      responsible_doctor: null,
      requesting_doctor: { id: "doctor-1", name: "doctor" },
      image_asset_count: 0,
      latest_image_asset: null,
      latest_ai_analysis: null,
      workflow_status_label: "pending",
      scheduled_at: null,
      ai_result: null,
      review: null,
    }],
  } as unknown as Awaited<ReturnType<typeof fetchRadiologyCaseWorkflow>>);
  const user = userEvent.setup();
  render(<Page />);
  await user.click(await screen.findByText("patient-1"));
  await screen.findByRole("button", { name: "uploaded-image" });
  expect(fetchRadiologyCaseWorkflow).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "uploaded-image" }));
  await waitFor(() => expect(fetchRadiologyCaseWorkflow).toHaveBeenCalledTimes(2));
});

it("renders only the worklist current exam from a case workflow", async () => {
  sessionStorage.setItem("accessToken", "test");
  const patient = { name: "patient-1", patient_code: "code-1" };
  const caseInfo = { id: "case-1", case_code: "CASE-1" };
  const makeExam = (id: string, label: string) => ({
    patient,
    case: caseInfo,
    examination_order: { id, order_type_label: label },
    requesting_doctor: { id: "doctor-1", name: "doctor" },
    responsible_doctor: null,
    image_asset_count: 0,
    latest_image_asset: null,
    latest_ai_analysis: null,
    workflow_status: "REVIEW_COMPLETED",
    workflow_status_label: "완료",
    scheduled_at: null,
    ai_result: null,
    review: null,
  });
  const xray = makeExam("xray-order", "X-ray");
  const ct = makeExam("ct-order", "CT");
  const pet = makeExam("pet-order", "PET-CT/TNM");
  vi.mocked(fetchRadiologyCaseWorklist).mockResolvedValue([{
    case: caseInfo,
    patient,
    responsible_doctor: null,
    exam_count: 3,
    current_exam: pet,
    workflow_status: "AI_READY",
    workflow_status_label: "분석 대기",
  }] as unknown as Awaited<ReturnType<typeof fetchRadiologyCaseWorklist>>);
  vi.mocked(fetchRadiologyCaseWorkflow).mockResolvedValue({
    patient,
    case: caseInfo,
    responsible_doctor: null,
    exams: [xray, ct, pet],
  } as unknown as Awaited<ReturnType<typeof fetchRadiologyCaseWorkflow>>);

  const user = userEvent.setup();
  render(<Page />);
  await user.click(await screen.findByText("patient-1"));

  const workstation = await screen.findByRole("main");
  expect(within(workstation).getByText("PET-CT/TNM")).toBeInTheDocument();
  expect(within(workstation).queryByText("X-ray")).not.toBeInTheDocument();
  expect(within(workstation).queryByText("CT")).not.toBeInTheDocument();
});

it("preserves selected case, summary and workflow through all pagination controls", async () => {
  sessionStorage.setItem("accessToken", "test");
  const rows = Array.from({ length: 21 }, (_, i) => ({
    case: { id: String(i) }, patient: { name: `patient-${i}`, patient_code: `code-${i}` },
    current_exam: { id: String(i), examination_order: { order_type_label: "CT" } },
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
