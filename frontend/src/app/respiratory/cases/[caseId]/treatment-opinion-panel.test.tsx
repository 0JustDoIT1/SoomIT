import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }));

vi.mock("@/components/ui/toast/toast", () => ({ showToast: toast }));

import { TreatmentOpinionPanel } from "./treatment-opinion-panel";

const props = {
  caseId: "case-1",
  apiBaseUrl: "http://test",
  selectedRegimenId: "11111111-1111-4111-8111-111111111111",
  treatmentType: "TARGETED_THERAPY",
  treatmentPlan: "현재 치료계획",
};
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const emptyPhysicianOpinion = { id: null, case: "case-1", physician_opinion: "", created_at: null, updated_at: null };

describe("TreatmentOpinionPanel", () => {
  it("shows independent AI and physician columns and keeps the AI result read-only", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response({ status: "SUCCEEDED", safety_status: "PASS", opinion: "AI 참고 소견", review_required: true }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);

    expect(screen.getByRole("heading", { name: "AI 치료 소견" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "호흡기내과 소견" })).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("치료에 대한 의료진 소견을 입력하세요.")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "치료 소견 생성" }));

    expect(await screen.findByText("AI 참고 소견")).toBeInTheDocument();
    expect(screen.getByLabelText("AI 치료 소견 내용").querySelector("textarea")).toBeNull();
    expect(authorizedFetch).toHaveBeenNthCalledWith(
      2,
      "http://test/api/doctor/cases/case-1/treatment-opinion/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(authorizedFetch.mock.calls[1][1].body)).toEqual({
      selected_regimen: props.selectedRegimenId,
      treatment_type: "TARGETED_THERAPY",
      treatment_plan: "현재 치료계획",
    });
  });

  it("keeps an empty physician opinion as a normal state and separates API failures", async () => {
    const emptyFetch = vi.fn().mockResolvedValue(response(emptyPhysicianOpinion));
    const emptyView = render(<TreatmentOpinionPanel {...props} authorizedFetch={emptyFetch} />);

    expect(await screen.findByText("작성된 호흡기내과 소견이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    emptyView.unmount();

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failedFetch = vi.fn().mockResolvedValue(response({ detail: "table unavailable" }, 500));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={failedFetch} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("호흡기내과 소견을 불러오지 못했습니다.");
    expect(screen.queryByText("작성된 호흡기내과 소견이 없습니다.")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("requires a selected draft regimen before generating without blocking physician input", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(response(emptyPhysicianOpinion));
    render(<TreatmentOpinionPanel {...props} selectedRegimenId={null} authorizedFetch={authorizedFetch} />);

    const editor = await screen.findByPlaceholderText("치료에 대한 의료진 소견을 입력하세요.");
    expect(editor).toBeEnabled();
    expect(screen.getByRole("button", { name: "치료 소견 생성" })).toBeDisabled();
    expect(screen.getByText(/Regimen을 선택하면/)).toBeInTheDocument();
    expect(authorizedFetch).toHaveBeenCalledTimes(1);
  });

  it("saves and restores the case-scoped physician opinion without requiring AI generation", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response({ ...emptyPhysicianOpinion, id: "opinion-1", physician_opinion: "의료진 직접 소견" }, 201));
    const view = render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    const editor = await screen.findByPlaceholderText("치료에 대한 의료진 소견을 입력하세요.");

    fireEvent.change(editor, { target: { value: "의료진 직접 소견" } });
    fireEvent.click(screen.getByRole("button", { name: "의료진 소견 저장" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("호흡기내과 소견이 저장되었습니다.", expect.any(Object)));
    expect(JSON.parse(authorizedFetch.mock.calls[1][1].body)).toEqual({ physician_opinion: "의료진 직접 소견" });
    expect(authorizedFetch.mock.calls[1][1]).toMatchObject({ method: "PUT" });
    expect(screen.queryByText("AI 참고 소견")).not.toBeInTheDocument();

    view.unmount();
    const reloadFetch = vi.fn().mockResolvedValue(response({ ...emptyPhysicianOpinion, id: "opinion-1", physician_opinion: "의료진 직접 소견" }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={reloadFetch} />);
    expect(await screen.findByDisplayValue("의료진 직접 소견")).toBeInTheDocument();
  });

  it("preserves a physician draft when saving fails and when AI is regenerated", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response({ detail: "저장 실패" }, 500))
      .mockResolvedValueOnce(response({ status: "SUCCEEDED", opinion: "새 AI 소견", review_required: true }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    const editor = await screen.findByPlaceholderText("치료에 대한 의료진 소견을 입력하세요.");

    fireEvent.change(editor, { target: { value: "보존할 의료진 초안" } });
    fireEvent.click(screen.getByRole("button", { name: "의료진 소견 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
    expect(editor).toHaveValue("보존할 의료진 초안");

    fireEvent.click(screen.getByRole("button", { name: "치료 소견 생성" }));
    expect(await screen.findByText("새 AI 소견")).toBeInTheDocument();
    expect(editor).toHaveValue("보존할 의료진 초안");
    consoleError.mockRestore();
  });

  it("keeps physician editing available when AI generation fails and allows retry", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response({ detail: "AI unavailable" }, 502))
      .mockResolvedValueOnce(response({ status: "SUCCEEDED", opinion: "재시도 AI 소견", review_required: true }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    const editor = await screen.findByPlaceholderText("치료에 대한 의료진 소견을 입력하세요.");
    fireEvent.change(editor, { target: { value: "AI 없이 작성한 소견" } });

    fireEvent.click(screen.getByRole("button", { name: "치료 소견 생성" }));
    expect(await screen.findByText("치료 소견을 생성하지 못했습니다.")).toBeInTheDocument();
    expect(editor).toBeEnabled();
    expect(editor).toHaveValue("AI 없이 작성한 소견");

    fireEvent.click(screen.getByRole("button", { name: "치료 소견 생성" }));
    expect(await screen.findByText("재시도 AI 소견")).toBeInTheDocument();
    expect(editor).toHaveValue("AI 없이 작성한 소견");
    consoleError.mockRestore();
  });

  it("reloads the physician opinion when the Case changes", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response({ ...emptyPhysicianOpinion, physician_opinion: "Case 1 소견" }))
      .mockResolvedValueOnce(response({ ...emptyPhysicianOpinion, case: "case-2", physician_opinion: "Case 2 소견" }));
    const view = render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    expect(await screen.findByDisplayValue("Case 1 소견")).toBeInTheDocument();

    view.rerender(<TreatmentOpinionPanel {...props} caseId="case-2" authorizedFetch={authorizedFetch} />);
    expect(await screen.findByDisplayValue("Case 2 소견")).toBeInTheDocument();
    expect(authorizedFetch.mock.calls.map(([url]) => url)).toEqual([
      "http://test/api/doctor/cases/case-1/physician-treatment-opinion/",
      "http://test/api/doctor/cases/case-2/physician-treatment-opinion/",
    ]);
  });

  it("renders a past treatment stage as read-only", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(response({ ...emptyPhysicianOpinion, physician_opinion: "확정 시점 소견" }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} readOnly />);

    expect(await screen.findByDisplayValue("확정 시점 소견")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "의료진 소견 저장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "치료 소견 생성" })).not.toBeInTheDocument();
  });
});
