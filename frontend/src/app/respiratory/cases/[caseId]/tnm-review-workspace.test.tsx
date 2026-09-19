import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { compareTnmValues, TnmReviewWorkspace } from "./tnm-review-workspace";

describe("TnmReviewWorkspace", () => {
  it("keeps specialist-confirmed values separate from AI candidates", async () => {
    const user = userEvent.setup();
    render(<TnmReviewWorkspace clinicalTnm={{ t_category: "cT2", n_category: "cN1", m_category: "cM0", stage_group: "IIB" }} aiTnm={{ predicted_t: "cT1", predicted_n: "cN0", predicted_m: "cM1", confidence: 0.82 }} />);

    expect(screen.getByText("B. 호흡기내과 판정 근거")).toBeTruthy();
    expect(screen.getByText("A. AI·규칙 후보")).toBeTruthy();
    expect(screen.getAllByText("cT2").length).toBeGreaterThan(0);
    expect(screen.getByText("cT1")).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: /N 림프절/ })[0]);
    expect(screen.getAllByText("cN1").length).toBeGreaterThan(0);
    expect(screen.getByText("cN0")).toBeTruthy();
  });

  it("does not enable unsupported review or confirmation actions", () => {
    const { container } = render(<TnmReviewWorkspace />);
    for (const label of ["cTNM 및 Stage Group 확정"]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
    for (const label of ["채택", "수정", "재검", "보류"]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getByText("PET-CT 근거 · AI 병기 후보 · 호흡기내과 판정 근거 · 호흡기내과 결정을 구분해 검토합니다.")).toBeTruthy();
    expect(screen.getByText("연결된 영상이 없습니다.")).toBeTruthy();
    expect(container.querySelector('[draggable="true"]')).toBeNull();
  });

  it("keeps a category draft while moving between T, N and T", async () => {
    const user = userEvent.setup();
    render(<TnmReviewWorkspace />);
    await user.selectOptions(screen.getByLabelText("최종 T 선택"), "T2");
    await user.click(screen.getAllByRole("tab", { name: /N 림프절/ })[0]);
    await user.selectOptions(screen.getByLabelText("최종 N 선택"), "N1");
    await user.click(screen.getByRole("tab", { name: /T 원발 종양/ }));
    expect(screen.getByLabelText("최종 T 선택")).toHaveValue("T2");
  });

  it("moves tabs with arrow keys and renders one tab panel", async () => {
    const user = userEvent.setup();
    render(<TnmReviewWorkspace />);
    const tTab = screen.getByRole("tab", { name: /T 원발 종양/ });
    tTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /N 림프절/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("compares values only when both results exist", () => {
    expect(compareTnmValues("T1", "T1")).toBe("MATCH");
    expect(compareTnmValues("T1", "T2")).toBe("DIFFERENCE");
    expect(compareTnmValues("T1", null)).toBe("UNAVAILABLE");
    expect(compareTnmValues(null, "T1")).toBe("UNAVAILABLE");
    expect(compareTnmValues(null, null)).toBe("EMPTY");
  });

  it("shows only the next TNM action for a saved result", () => {
    const { rerender } = render(
      <TnmReviewWorkspace
        caseId="case-1" apiBaseUrl="http://test" authorizedFetch={vi.fn()}
        clinicalResultId="tnm-result-1"
        clinicalResultStatus="DRAFT"
      />,
    );

    expect(screen.getByRole("button", { name: "TNM 결과 확정" })).toBeEnabled();

    rerender(
      <TnmReviewWorkspace
        caseId="case-1" apiBaseUrl="http://test" authorizedFetch={vi.fn()}
        clinicalResultId="tnm-result-1"
        clinicalResultStatus="CONFIRMED"
      />,
    );

    expect(screen.getByRole("button", { name: "Stage 계산" })).toBeEnabled();
  });
});

const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const apiProps = { caseId: "case-1", apiBaseUrl: "http://test", aiTnm: { ai_result_id: "ai-1" } };

it("shows waiting TNM evidence but blocks editing and finalization", () => {
  const authorizedFetch = vi.fn();
  render(<TnmReviewWorkspace {...apiProps} actionable={false} authorizedFetch={authorizedFetch} clinicalResultId="tnm-1" clinicalResultStatus="CONFIRMED" clinicalTnm={{ evidence: { stage: { stage_group_status: "candidate_ready", stage_group_candidate: "IIA" } } }} />);
  expect(screen.getByLabelText("최종 T 선택")).toBeDisabled();
  const button = screen.getByRole("button", { name: "Stage Group 확정 및 다음 단계 진행" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(authorizedFetch).not.toHaveBeenCalled();
});

async function enterTnm() {
  fireEvent.change(screen.getByLabelText("최종 T 선택"), { target: { value: "T1" } });
  fireEvent.click(screen.getByRole("tab", { name: /N 림프절/ }));
  fireEvent.change(screen.getByLabelText("최종 N 선택"), { target: { value: "N0" } });
  fireEvent.click(screen.getByRole("tab", { name: /M 원격 전이/ }));
  fireEvent.change(screen.getByLabelText("최종 M 선택"), { target: { value: "M0" } });
  fireEvent.click(screen.getByRole("tab", { name: /T 원발 종양/ }));
}

it("saves edited TNM values and confirms the ID returned by the latest save", async () => {
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response({ id: "draft-1" }))
    .mockResolvedValueOnce(response({ id: "draft-2" }))
    .mockResolvedValueOnce(response({ id: "draft-2", result_status: "CONFIRMED" }));
  const onDirtyChange = vi.fn();
  render(<TnmReviewWorkspace {...apiProps} authorizedFetch={authorizedFetch} onDirtyChange={onDirtyChange} />);
  await enterTnm();
  fireEvent.click(screen.getByRole("button", { name: "TNM 초안 저장" }));
  await screen.findByText("TNM 초안이 저장되었습니다.");
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  fireEvent.change(screen.getByLabelText("최종 T 선택"), { target: { value: "T2" } });
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "TNM 결과 확정" }));
  await screen.findByText("TNM 결과가 확정되었습니다.");
  expect(authorizedFetch).toHaveBeenCalledTimes(3);
  expect(JSON.parse(authorizedFetch.mock.calls[1][1].body)).toMatchObject({ t_category: "T2", n_category: "N0", m_category: "M0", reviewed_ai_result_id: "ai-1" });
  expect(authorizedFetch.mock.calls[2][0]).toBe("http://test/api/doctor/cases/case-1/clinical-results/tnm/draft-2/confirm/");
  expect(screen.getByLabelText("최종 T 선택")).toBeDisabled();
});

it("does not confirm when saving dirty TNM values fails", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(response({ detail: "저장 실패" }, 400));
  render(<TnmReviewWorkspace {...apiProps} authorizedFetch={authorizedFetch} clinicalResultId="saved" clinicalResultStatus="DRAFT" clinicalTnm={{ t_category: "T1", n_category: "N0", m_category: "M0" }} />);
  fireEvent.change(screen.getByLabelText("최종 T 선택"), { target: { value: "T2" } });
  fireEvent.click(screen.getByRole("button", { name: "TNM 결과 확정" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("TNM 결과 처리에 실패했습니다.");
  expect(authorizedFetch).toHaveBeenCalledTimes(1);
  expect(authorizedFetch.mock.calls[0][0]).toBe("http://test/api/doctor/cases/case-1/clinical-results/tnm/");
  expect(screen.getByLabelText("최종 T 선택")).toHaveValue("T2");
  expect(screen.getByText(/저장되지 않은 변경사항이 있습니다/)).toBeInTheDocument();
});

it("blocks duplicate TNM requests while saving and confirming", async () => {
  let resolveSave!: (value: Response) => void;
  const authorizedFetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSave = resolve; }))
    .mockResolvedValueOnce(response({ id: "saved", result_status: "CONFIRMED" }));
  render(<TnmReviewWorkspace {...apiProps} authorizedFetch={authorizedFetch} clinicalResultId="saved" clinicalResultStatus="DRAFT" clinicalTnm={{ t_category: "T1", n_category: "N0", m_category: "M0" }} />);
  fireEvent.change(screen.getByLabelText("최종 T 선택"), { target: { value: "T2" } });
  const button = screen.getByRole("button", { name: "TNM 결과 확정" });
  act(() => { button.click(); button.click(); });
  expect(authorizedFetch).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  expect(screen.getByLabelText("최종 T 선택")).toBeDisabled();
  await act(async () => resolveSave(response({ id: "saved" })));
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(2));
});

it("requires a ready Stage candidate and only then submits final confirmation with advancement", async () => {
  const ready = { stage_group_candidate: "IIA", stage_group_status: "candidate_ready" };
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response({ id: "saved", evidence: { stage: ready } }))
    .mockResolvedValueOnce(response({ id: "saved", stage_group: "IIA", evidence: { stage: ready } }));
  const onStageAdvanced = vi.fn();
  render(<TnmReviewWorkspace {...apiProps} authorizedFetch={authorizedFetch} clinicalResultId="saved" clinicalResultStatus="CONFIRMED" clinicalTnm={{ evidence: { stage: { stage_group_candidate: "IIA", stage_group_status: "indeterminate" } } }} onStageAdvanced={onStageAdvanced} />);
  expect(screen.queryByRole("button", { name: "Stage Group 확정 및 다음 단계 진행" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Stage 계산" }));
  const finalize = await screen.findByRole("button", { name: "Stage Group 확정 및 다음 단계 진행" });
  fireEvent.click(finalize);
  await waitFor(() => expect(onStageAdvanced).toHaveBeenCalledOnce());
  expect(authorizedFetch.mock.calls.map(([url]) => url)).toEqual([
    "http://test/api/doctor/cases/case-1/clinical-results/tnm/saved/stage/",
    "http://test/api/doctor/cases/case-1/clinical-results/tnm/saved/stage/confirm/",
  ]);
  expect(JSON.parse(authorizedFetch.mock.calls[1][1].body)).toEqual({ advance_to_next_stage: true });
  expect(screen.getByText("Stage Group 확정 완료")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Stage Group 확정 및 다음 단계 진행" })).not.toBeInTheDocument();
});
