import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
const notGenerated = { case_id: "case-1", status: "NOT_GENERATED", opinion: null, sources: [], review_required: true };
const longitudinalOpinion = (xraySummary: string) => JSON.stringify({
  xray_summary: xraySummary,
  ct_summary: "CT 결절 확인",
  staging_summary: "Stage IVA",
  pathology_biomarker_summary: "선암, EGFR 양성",
  treatment_summary: "오시머티닙 치료계획",
  safety_follow_up: "안전성 확인 후 추적",
});

describe("TreatmentOpinionPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("uses the existing POST when demo mode is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_TREATMENT_OPINION_DEMO", "false");
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response(notGenerated))
      .mockResolvedValueOnce(response({ status: "AVAILABLE", opinion: longitudinalOpinion("Production result") }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    fireEvent.click(await screen.findByRole("button", { name: "종합 소견 생성" }));
    expect(await screen.findByText("Production result")).toBeInTheDocument();
    expect(authorizedFetch).toHaveBeenNthCalledWith(3, expect.stringContaining("/treatment-opinion/"), expect.objectContaining({ method: "POST" }));
  });

  it("waits five seconds for the fixed demo result without POST or changing the physician draft", async () => {
    vi.stubEnv("NEXT_PUBLIC_TREATMENT_OPINION_DEMO", "true");
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response({ ...notGenerated, status: "AVAILABLE", opinion: longitudinalOpinion("Previous AI result") }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    const editor = await screen.findByRole("textbox");
    await screen.findByText("Previous AI result");
    fireEvent.change(editor, { target: { value: "Physician draft" } });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "종합 소견 다시 생성" }));
    expect(screen.getByRole("button", { name: "종합 소견 생성 중..." })).toBeDisabled();
    expect(screen.getByText("Previous AI result")).toBeInTheDocument();
    expect(authorizedFetch).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(screen.getByText("Previous AI result")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText("흉부 X-ray에서 좌측 폐결절 의심부위가 확인되었다. 이에 따라 흉부 CT 추가 검사를 권고하였다.")).toBeInTheDocument();
    expect(screen.getByText("후속 흉부 CT에서 1번 결절(최대 28.79 mm), 악성 위험도 93.11%가 확인되었다.")).toBeInTheDocument();
    expect(screen.getByText("현재 상태는 '처방 안전성 검토 전'이다. 기록된 처방 차단 또는 미해결 경고는 없다. 치료 시작 전 의료진의 최종 안전성 확인과 치료계획에 따른 추적 관찰이 필요하다.")).toBeInTheDocument();
    expect(screen.getByText(/CONFIRMED_DATA_FALLBACK_V3.*safety_not_run/)).toBeInTheDocument();
    expect(editor).toHaveValue("Physician draft");
    expect(authorizedFetch).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending demo result after unmount", async () => {
    vi.stubEnv("NEXT_PUBLIC_TREATMENT_OPINION_DEMO", "true");
    toast.success.mockClear();
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response(notGenerated));
    const view = render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    const button = await screen.findByRole("button", { name: "종합 소견 생성" });
    vi.useFakeTimers();
    fireEvent.click(button);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(authorizedFetch).toHaveBeenCalledTimes(2);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows independent AI and physician columns and keeps the AI result read-only", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response(notGenerated))
      .mockResolvedValueOnce(response({ status: "SUCCEEDED", safety_status: "PASS", opinion: longitudinalOpinion("AI 참고 소견"), review_required: true }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);

    expect(screen.getByRole("heading", { name: "AI 진료 종합 소견" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "호흡기내과 최종 종합 소견" })).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("검사 전 과정과 진단·병기·치료계획을 종합한 최종 소견을 입력하세요.")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "종합 소견 생성" }));

    expect(await screen.findByText("AI 참고 소견")).toBeInTheDocument();
    expect(screen.getByLabelText("AI 진료 종합 소견 내용").querySelector("textarea")).toBeNull();
    expect(authorizedFetch).toHaveBeenNthCalledWith(
      3,
      "http://test/api/doctor/cases/case-1/treatment-opinion/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(authorizedFetch.mock.calls[2][1].body)).toEqual({
      selected_regimen: props.selectedRegimenId,
      treatment_type: "TARGETED_THERAPY",
      treatment_plan: "현재 치료계획",
    });
  });

  it("keeps an empty physician opinion as a normal state and separates API failures", async () => {
    const emptyFetch = vi.fn((url: RequestInfo | URL) => Promise.resolve(response(String(url).includes("physician-treatment-opinion") ? emptyPhysicianOpinion : notGenerated)));
    const emptyView = render(<TreatmentOpinionPanel {...props} authorizedFetch={emptyFetch} />);

    expect(await screen.findByText("작성된 호흡기내과 소견이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    emptyView.unmount();

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failedFetch = vi.fn((url: RequestInfo | URL) => Promise.resolve(String(url).includes("physician-treatment-opinion") ? response({ detail: "table unavailable" }, 500) : response(notGenerated)));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={failedFetch} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("호흡기내과 소견을 불러오지 못했습니다.");
    expect(screen.queryByText("작성된 호흡기내과 소견이 없습니다.")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("requires a selected draft regimen before generating without blocking physician input", async () => {
    const authorizedFetch = vi.fn((url: RequestInfo | URL) => Promise.resolve(response(String(url).includes("physician-treatment-opinion") ? emptyPhysicianOpinion : notGenerated)));
    render(<TreatmentOpinionPanel {...props} selectedRegimenId={null} authorizedFetch={authorizedFetch} />);

    const editor = await screen.findByPlaceholderText("검사 전 과정과 진단·병기·치료계획을 종합한 최종 소견을 입력하세요.");
    expect(editor).toBeEnabled();
    expect(screen.getByRole("button", { name: "종합 소견 생성" })).toBeDisabled();
    expect(screen.getByText(/Regimen을 선택하면/)).toBeInTheDocument();
    expect(authorizedFetch).toHaveBeenCalledTimes(2);
  });

  it("saves and restores the case-scoped physician opinion without requiring AI generation", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response(notGenerated))
      .mockResolvedValueOnce(response({ ...emptyPhysicianOpinion, id: "opinion-1", physician_opinion: "의료진 직접 소견" }, 201));
    const view = render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    const editor = await screen.findByPlaceholderText("검사 전 과정과 진단·병기·치료계획을 종합한 최종 소견을 입력하세요.");

    fireEvent.change(editor, { target: { value: "의료진 직접 소견" } });
    fireEvent.click(screen.getByRole("button", { name: "의료진 소견 저장" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("호흡기내과 소견이 저장되었습니다.", expect.any(Object)));
    expect(JSON.parse(authorizedFetch.mock.calls[2][1].body)).toEqual({ physician_opinion: "의료진 직접 소견" });
    expect(authorizedFetch.mock.calls[2][1]).toMatchObject({ method: "PUT" });
    expect(screen.queryByText("AI 참고 소견")).not.toBeInTheDocument();

    view.unmount();
    const reloadFetch = vi.fn((url: RequestInfo | URL) => Promise.resolve(response(String(url).includes("physician-treatment-opinion") ? { ...emptyPhysicianOpinion, id: "opinion-1", physician_opinion: "의료진 직접 소견" } : notGenerated)));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={reloadFetch} />);
    expect(await screen.findByDisplayValue("의료진 직접 소견")).toBeInTheDocument();
  });

  it("preserves a physician draft when saving fails and when AI is regenerated", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response(notGenerated))
      .mockResolvedValueOnce(response({ detail: "저장 실패" }, 500))
      .mockResolvedValueOnce(response({ status: "SUCCEEDED", opinion: longitudinalOpinion("새 AI 소견"), review_required: true }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    const editor = await screen.findByPlaceholderText("검사 전 과정과 진단·병기·치료계획을 종합한 최종 소견을 입력하세요.");

    fireEvent.change(editor, { target: { value: "보존할 의료진 초안" } });
    fireEvent.click(screen.getByRole("button", { name: "의료진 소견 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
    expect(editor).toHaveValue("보존할 의료진 초안");

    fireEvent.click(screen.getByRole("button", { name: "종합 소견 생성" }));
    expect(await screen.findByText("새 AI 소견")).toBeInTheDocument();
    expect(editor).toHaveValue("보존할 의료진 초안");
    consoleError.mockRestore();
  });

  it("keeps physician editing available when AI generation fails and allows retry", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response(notGenerated))
      .mockResolvedValueOnce(response({ detail: "AI unavailable" }, 502))
      .mockResolvedValueOnce(response({ status: "SUCCEEDED", opinion: longitudinalOpinion("재시도 AI 소견"), review_required: true }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    const editor = await screen.findByPlaceholderText("검사 전 과정과 진단·병기·치료계획을 종합한 최종 소견을 입력하세요.");
    fireEvent.change(editor, { target: { value: "AI 없이 작성한 소견" } });

    fireEvent.click(screen.getByRole("button", { name: "종합 소견 생성" }));
    expect(await screen.findByText("AI unavailable")).toBeInTheDocument();
    expect(editor).toBeEnabled();
    expect(editor).toHaveValue("AI 없이 작성한 소견");

    fireEvent.click(screen.getByRole("button", { name: "종합 소견 생성" }));
    expect(await screen.findByText("재시도 AI 소견")).toBeInTheDocument();
    expect(editor).toHaveValue("AI 없이 작성한 소견");
    consoleError.mockRestore();
  });

  it("reloads the physician opinion when the Case changes", async () => {
    const authorizedFetch = vi.fn((url: RequestInfo | URL) => {
      const value = String(url);
      if (value.includes("physician-treatment-opinion")) {
        return Promise.resolve(response({ ...emptyPhysicianOpinion, case: value.includes("case-2") ? "case-2" : "case-1", physician_opinion: value.includes("case-2") ? "Case 2 소견" : "Case 1 소견" }));
      }
      return Promise.resolve(response({ ...notGenerated, case_id: value.includes("case-2") ? "case-2" : "case-1" }));
    });
    const view = render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);
    expect(await screen.findByDisplayValue("Case 1 소견")).toBeInTheDocument();

    view.rerender(<TreatmentOpinionPanel {...props} caseId="case-2" authorizedFetch={authorizedFetch} />);
    expect(await screen.findByDisplayValue("Case 2 소견")).toBeInTheDocument();
    expect(authorizedFetch.mock.calls.map(([url]) => url)).toEqual([
      "http://test/api/doctor/cases/case-1/physician-treatment-opinion/",
      "http://test/api/doctor/cases/case-1/treatment-opinion/",
      "http://test/api/doctor/cases/case-2/physician-treatment-opinion/",
      "http://test/api/doctor/cases/case-2/treatment-opinion/",
    ]);
  });

  it("renders a past treatment stage as read-only", async () => {
    const authorizedFetch = vi.fn((url: RequestInfo | URL) => Promise.resolve(response(String(url).includes("physician-treatment-opinion") ? { ...emptyPhysicianOpinion, physician_opinion: "확정 시점 소견" } : notGenerated)));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} readOnly />);

    expect(await screen.findByDisplayValue("확정 시점 소견")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "의료진 소견 저장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "종합 소견 생성" })).not.toBeInTheDocument();
  });

  it("restores a persisted AI opinion in the confirmed read-only view", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response({ ...notGenerated, status: "AVAILABLE", opinion: longitudinalOpinion("확정 전에 저장된 AI 소견"), safety_status: "safety_completed" }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} readOnly />);

    expect(await screen.findByText("확정 전에 저장된 AI 소견")).toBeInTheDocument();
    expect(screen.getByText(/저장된 참고 소견/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /소견 생성/ })).not.toBeInTheDocument();
  });

  it("hides a legacy treatment-only opinion and allows a one-time longitudinal backfill", async () => {
    const legacyOpinion = JSON.stringify({
      clinical_summary: "IVA 단계 NSCLC",
      treatment_summary: "오시머티닙 권장",
      evidence_summary: "치료 근거",
      safety_summary: "안전성 요약",
      cautions: "주의사항",
    });
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response({ ...notGenerated, status: "AVAILABLE", opinion: legacyOpinion }))
      .mockResolvedValueOnce(response({ ...notGenerated, status: "AVAILABLE", opinion: longitudinalOpinion("확정 계획 기반 AI 소견") }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} readOnly />);

    expect(screen.queryByText("임상 요약")).not.toBeInTheDocument();
    expect(screen.queryByText("IVA 단계 NSCLC")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "확정 결과로 종합 소견 생성" }));
    expect(await screen.findByText("확정 계획 기반 AI 소견")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "확정 결과로 종합 소견 생성" })).not.toBeInTheDocument();
  });

  it("renders the longitudinal JSON as compact stage sections without breaking the layout", async () => {
    const longitudinalJson = '```json\n{"xray_summary":"X-ray result","ct_summary":"CT result","staging_summary":"Stage IVA","pathology_biomarker_summary":"Adenocarcinoma, EGFR positive","treatment_summary":"Osimertinib","safety_follow_up":"Safety follow-up"}\n```';
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response(emptyPhysicianOpinion))
      .mockResolvedValueOnce(response({ ...notGenerated, status: "AVAILABLE", opinion: longitudinalJson }));
    render(<TreatmentOpinionPanel {...props} authorizedFetch={authorizedFetch} />);

    expect(await screen.findByText("X-ray 소견")).toBeInTheDocument();
    expect(screen.getByText("CT 소견")).toBeInTheDocument();
    expect(screen.getByText("PET-CT / TNM 병기")).toBeInTheDocument();
    expect(screen.getByText("병리·유전자·PD-L1")).toBeInTheDocument();
    expect(screen.getByText("치료계획 및 결정 근거")).toBeInTheDocument();
    expect(screen.getByText("안전성 및 추적 계획")).toBeInTheDocument();
    expect(screen.queryByText(/```json/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("AI 진료 종합 소견 내용")).toHaveClass("max-h-80", "overflow-y-auto", "overflow-x-hidden");
  });
});
