import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { compareTnmValues, TnmReviewWorkspace } from "./tnm-review-workspace";

vi.mock("./case-dicom-evidence", () => ({ CaseDicomEvidence: () => <div /> }));

const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const apiProps = { caseId: "case-1", apiBaseUrl: "http://test", aiTnm: { ai_result_id: "ai-1" } };
const finalizeLabel = "TNM 확정 및 다음 단계 진행";

async function enterTnm() {
  fireEvent.change(screen.getByLabelText("최종 T 선택"), { target: { value: "T1" } });
  fireEvent.click(screen.getByRole("tab", { name: /N 림프절/ }));
  fireEvent.change(screen.getByLabelText("최종 N 선택"), { target: { value: "N0" } });
  fireEvent.click(screen.getByRole("tab", { name: /M 원격 전이/ }));
  fireEvent.change(screen.getByLabelText("최종 M 선택"), { target: { value: "M0" } });
}

describe("TnmReviewWorkspace", () => {
  it("keeps Stage warnings while placing the single final action in the top header", () => {
    render(<TnmReviewWorkspace clinicalTnm={{ evidence: { stage: { warnings: ["검토 필요"] } } }} />);
    const workspace = screen.getByRole("region", { name: "TNM 작업공간" });
    const rail = screen.getByRole("tabpanel");
    expect(workspace).toHaveClass("min-h-0", "flex-1");
    expect(workspace.firstElementChild).toHaveClass("grid-cols-[minmax(0,1fr)]");
    expect(workspace.className).not.toMatch(/min-h-\[780px\]|overflow-auto/);
    expect(rail).toHaveClass("overflow-y-auto");
    expect(rail).not.toContainElement(screen.getByRole("alert"));
    expect(rail).not.toContainElement(screen.getByRole("button", { name: finalizeLabel }));
    expect(screen.getByLabelText("PET-CT/TNM 상단 작업")).toContainElement(
      screen.getByRole("button", { name: finalizeLabel }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("검토 필요");
  });

  it("hides only the result-difference notice without leaving its viewer row", () => {
    render(<TnmReviewWorkspace aiTnm={{ predicted_t: "T1" }} clinicalTnm={{ t_category: "T2", evidence: { stage: { warnings: ["입력 부족"] } } }} />);

    expect(screen.queryByText("결과 차이 확인 필요")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("입력 부족");
    const viewerColumn = screen.getByRole("tablist", { name: "TNM 범주" }).parentElement;
    expect(viewerColumn).toHaveClass("grid-rows-[30px_minmax(0,1fr)]");
    expect(viewerColumn).not.toHaveClass("grid-rows-[30px_minmax(0,1fr)_28px]");
  });

  it("keeps specialist-confirmed values separate from AI candidates", async () => {
    const user = userEvent.setup();
    render(<TnmReviewWorkspace clinicalTnm={{ t_category: "cT2", n_category: "cN1", m_category: "cM0", stage_group: "IIB" }} aiTnm={{ predicted_t: "cT1", predicted_n: "cN0", predicted_m: "cM1", confidence: 0.82 }} />);

    expect(screen.getAllByText("cT2").length).toBeGreaterThan(0);
    expect(screen.getByText("cT1")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: /N 림프절/ }));
    expect(screen.getAllByText("cN1").length).toBeGreaterThan(0);
    expect(screen.getByText("cN0")).toBeTruthy();
  });

  it("keeps a completed past TNM stage read-only without workflow actions", () => {
    render(<TnmReviewWorkspace {...apiProps} actionable={false} authorizedFetch={vi.fn()} clinicalResultId="tnm-1" clinicalResultStatus="CONFIRMED" clinicalTnm={{ t_category: "T1", n_category: "N0", m_category: "M0", stage_group: "IIA", evidence: { stage: { stage_group_candidate: "IIA", stage_group_status: "candidate_ready" } } }} />);

    expect(screen.getByText("Stage Group 확정 완료")).toBeInTheDocument();
    expect(screen.getByText("현재 Case 단계가 아니므로 결과 조회만 가능합니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다음 처리 선택" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: finalizeLabel })).not.toBeInTheDocument();
  });

  it("keeps a category draft while moving between TNM tabs", async () => {
    const user = userEvent.setup();
    render(<TnmReviewWorkspace />);
    await user.selectOptions(screen.getByLabelText("최종 T 선택"), "T2");
    await user.click(screen.getByRole("tab", { name: /N 림프절/ }));
    await user.selectOptions(screen.getByLabelText("최종 N 선택"), "N1");
    await user.click(screen.getByRole("tab", { name: /T 원발 종양/ }));
    expect(screen.getByLabelText("최종 T 선택")).toHaveValue("T2");
  });

  it("compares values only when both results exist", () => {
    expect(compareTnmValues("T1", "T1")).toBe("MATCH");
    expect(compareTnmValues("T1", "T2")).toBe("DIFFERENCE");
    expect(compareTnmValues("T1", null)).toBe("UNAVAILABLE");
    expect(compareTnmValues(null, null)).toBe("EMPTY");
  });

  it("uses one action to save, confirm, calculate, and finalize TNM", async () => {
    const ready = { stage_group_candidate: "IIA", stage_group_status: "candidate_ready" };
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response({ id: "draft-1" }))
      .mockResolvedValueOnce(response({ id: "draft-1", result_status: "CONFIRMED" }))
      .mockResolvedValueOnce(response({ id: "draft-1", evidence: { stage: ready } }))
      .mockResolvedValueOnce(response({ id: "draft-1", stage_group: "IIA", evidence: { stage: ready } }))
      .mockResolvedValueOnce(response({ current_stage: "PATHOLOGY_GENE", case_status: "ACTIVE" }));
    const onStageAdvanced = vi.fn();
    render(<TnmReviewWorkspace {...apiProps} authorizedFetch={authorizedFetch} onStageAdvanced={onStageAdvanced} />);

    await enterTnm();
    fireEvent.click(screen.getByRole("button", { name: finalizeLabel }));
    await waitFor(() => expect(screen.getByRole("button", { name: "다음 처리 선택" })).toBeEnabled());

    expect(authorizedFetch.mock.calls.map(([url]) => url)).toEqual([
      "http://test/api/doctor/cases/case-1/clinical-results/tnm/",
      "http://test/api/doctor/cases/case-1/clinical-results/tnm/draft-1/confirm/",
      "http://test/api/doctor/cases/case-1/clinical-results/tnm/draft-1/stage/",
      "http://test/api/doctor/cases/case-1/clinical-results/tnm/draft-1/stage/confirm/",
    ]);
    expect(JSON.parse(authorizedFetch.mock.calls[0][1].body)).toMatchObject({ t_category: "T1", n_category: "N0", m_category: "M0", reviewed_ai_result_id: "ai-1" });
    expect(onStageAdvanced).not.toHaveBeenCalled();
    expect(JSON.parse(authorizedFetch.mock.calls[3][1].body)).toEqual({ advance_to_next_stage: false });
    expect(screen.getByText("Stage Group 확정 완료")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다음 처리 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 단계 진행" }));
    await waitFor(() => expect(onStageAdvanced).toHaveBeenCalledWith(expect.objectContaining({
      closed: false,
      currentStage: "PATHOLOGY_GENE",
      caseStatus: "ACTIVE",
    })));
  });

  it("does not continue when the latest TNM save fails", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(response({ detail: "저장 실패" }, 400));
    render(<TnmReviewWorkspace {...apiProps} authorizedFetch={authorizedFetch} clinicalResultId="saved" clinicalResultStatus="DRAFT" clinicalTnm={{ t_category: "T1", n_category: "N0", m_category: "M0" }} />);
    fireEvent.change(screen.getByLabelText("최종 T 선택"), { target: { value: "T2" } });
    fireEvent.click(screen.getByRole("button", { name: finalizeLabel }));
    expect(await screen.findByRole("alert")).toHaveTextContent("TNM 결과 처리에 실패했습니다.");
    expect(authorizedFetch).toHaveBeenCalledTimes(1);
    expect(authorizedFetch.mock.calls[0][0]).toBe("http://test/api/doctor/cases/case-1/clinical-results/tnm/");
  });

  it("blocks duplicate TNM finalization requests", async () => {
    let resolveSave!: (value: Response) => void;
    const ready = { stage_group_candidate: "IIA", stage_group_status: "candidate_ready" };
    const authorizedFetch = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSave = resolve; }))
      .mockResolvedValueOnce(response({ id: "saved", result_status: "CONFIRMED" }))
      .mockResolvedValueOnce(response({ id: "saved", evidence: { stage: ready } }))
      .mockResolvedValueOnce(response({ id: "saved", stage_group: "IIA", evidence: { stage: ready } }));
    render(<TnmReviewWorkspace {...apiProps} authorizedFetch={authorizedFetch} clinicalResultId="saved" clinicalResultStatus="DRAFT" clinicalTnm={{ t_category: "T1", n_category: "N0", m_category: "M0" }} />);
    fireEvent.change(screen.getByLabelText("최종 T 선택"), { target: { value: "T2" } });
    const button = screen.getByRole("button", { name: finalizeLabel });
    act(() => { button.click(); button.click(); });
    expect(authorizedFetch).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => resolveSave(response({ id: "saved" })));
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(4));
  });

  it("keeps the top action visible under the shared dark theme", () => {
    document.documentElement.dataset.theme = "dark";
    render(<TnmReviewWorkspace {...apiProps} authorizedFetch={vi.fn()} />);

    expect(screen.getByLabelText("PET-CT/TNM 상단 작업")).toContainElement(
      screen.getByRole("button", { name: finalizeLabel }),
    );
    document.documentElement.dataset.theme = "light";
  });
});
