import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardStageEvidence, confirmedCtLesions, confirmedStageSummary, matchedDetections } from "./dashboard-stage-evidence";

vi.mock("./dashboard-dicom-preview", () => ({ createDicomPreview: vi.fn(async () => new Blob(["preview"], { type: "image/png" })) }));
const caseItem = { id: "case-a", case_code: "CASE-A", patient_code: "P-A", patient_name: "환자 가", current_stage: "PATHOLOGY_GENE", case_status: "ACTIVE" };
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
const imageResponse = () => new Response(new Blob(["image"], { type: "image/png" }), { headers: { "Content-Type": "image/png" } });
const analysis = { analysis_type: "XRAY_ANALYSIS", status: "SUCCEEDED", input_context: { source_asset: { id: "asset-a" } }, result_detail: { result_payload: { image: { width: 100, height: 100 }, detections: [{ class_name: "nodule", bbox_xyxy: [10, 20, 30, 40] }, { class_name: "invalid", bbox_xyxy: [10, 20, 130, 140] }] } } };

beforeEach(() => {
  vi.stubGlobal("URL", URL);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

describe("stage evidence", () => {
  it.each([["PATHOLOGY_GENE", "HE"], ["PDL1", "PDL1"]])("selects only the matching %s stain and opens the same Case", async (stage, stain) => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/specimens/")) return json([{ id: "specimen" }]);
      if (String(url).endsWith("/slides/")) return json([{ id: "he", stain: "HE", status: "READY", slide_code: "HE-1" }, { id: "pdl1", stain: "PDL1", status: "READY", slide_code: "PD-1" }]);
      return imageResponse();
    });
    const open = vi.fn();
    const { unmount } = render(<DashboardStageEvidence caseItem={{ ...caseItem, current_stage: stage }} status="진행 중" authorizedFetch={fetcher} onOpenCase={open} />);
    expect(await screen.findByRole("img", { name: /환자 가/ })).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith(`/slides/${stain === "HE" ? "he" : "pdl1"}/thumbnail/`))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /검사 상세 열기/ }));
    expect(open).toHaveBeenCalledWith("case-a");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("never projects unmatched or invalid detection coordinates", () => {
    expect(matchedDetections([analysis], "another-asset")).toEqual({});
    expect(matchedDetections([analysis], "asset-a").detections).toHaveLength(1);
  });

  it("shows matched X-ray candidates and removes them for image dimension mismatch", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/image-assets/") ? json([{ id: "asset-a", workflow_stage: "XRAY", status: "READY", preview_url: "/preview/" }]) : String(url).endsWith("/ai-results/") ? json([analysis]) : imageResponse());
    render(<DashboardStageEvidence caseItem={{ ...caseItem, current_stage: "XRAY" }} status="완료" authorizedFetch={fetcher} onOpenCase={vi.fn()} />);
    const img = await screen.findByRole("img", { name: /환자 가/ });
    expect(screen.getByLabelText("AI 검출 후보 위치")).toBeInTheDocument();
    fireEvent.load(img);
    expect(screen.queryByLabelText("AI 검출 후보 위치")).not.toBeInTheDocument();
  });

  it.each(["CT", "PET_CT_TNM"])("loads only one %s instance and labels it as a middle slice", async stage => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/image-assets/")) return json([{ id: "asset", workflow_stage: stage, status: "READY", image_type: "CT" }]);
      if (String(url).endsWith("/instances/")) return json([3, 1, 2].map(i => ({ "00080018": { Value: [`uid-${i}`] }, "00200013": { Value: [i] } })));
      return new Response(new Blob(["dicom"]));
    });
    render(<DashboardStageEvidence caseItem={{ ...caseItem, current_stage: stage }} status="진행 중" authorizedFetch={fetcher} onOpenCase={vi.fn()} />);
    expect(await screen.findByRole("img", { name: /중간 단면 2\/3/ })).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/instances/uid-2/"))).toHaveLength(1);
    expect(screen.queryByLabelText("AI 검출 후보 위치")).not.toBeInTheDocument();
  });

  it("uses a neutral reference fallback and retries a failed request locally", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValue(json([]));
    render(<DashboardStageEvidence caseItem={caseItem} status="대기" authorizedFetch={fetcher} onOpenCase={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("현재 단계 이미지 없음 · 해부학 참고 그림")).toBeInTheDocument();
  });

  it("does not leak a late previous Case image after switching Cases", async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    const { rerender } = render(<DashboardStageEvidence key="a" caseItem={caseItem} status="대기" authorizedFetch={fetcher} onOpenCase={vi.fn()} />);
    rerender(<DashboardStageEvidence key="b" caseItem={{ ...caseItem, id: "case-b", patient_name: "환자 나" }} status="대기" authorizedFetch={async () => json([])} onOpenCase={vi.fn()} />);
    await act(async () => finish(json([])));
    await waitFor(() => expect(screen.queryByText(/환자 가/)).not.toBeInTheDocument());
    expect(screen.queryByRole("img", { name: /환자 가/ })).not.toBeInTheDocument();
  });

  it("never describes draft PD-L1 values as confirmed", () => {
    const result = { workflow_stage: "PDL1", result_status: "DRAFT", result_detail: { pdl1: { tps_percent: 0 } } };
    expect(confirmedStageSummary("PDL1", { clinicalResults: [result], orders: [], aiResults: [] })).toBe("");
    expect(confirmedStageSummary("PDL1", { clinicalResults: [{ ...result, result_status: "CONFIRMED" }], orders: [], aiResults: [] })).toBe("TPS 0%");
  });

  it("marks only clinician-confirmed CT lesion locations on the anatomy fallback", async () => {
    const snapshot = {
      clinicalResults: [{
        workflow_stage: "CT",
        result_status: "CONFIRMED",
        result_detail: { ct: { nodule_observations: [
          { nodule_no: 1, lobe: "RUL", lobe_label: "우상엽", max_diameter_mm: 13.2 },
          { nodule_no: 2, lobe: "UNKNOWN", lobe_label: "미상" },
        ] } },
      }],
      orders: [],
      aiResults: [],
    };

    expect(confirmedCtLesions(snapshot)).toEqual([{ id: "ct-nodule-1", label: "결절 1 · 우상엽", lobe: "RUL", diameterMm: 13.2 }]);
    render(<DashboardStageEvidence caseItem={caseItem} snapshot={snapshot} status="검토 중" authorizedFetch={async () => json([])} onOpenCase={vi.fn()} />);
    expect(await screen.findByText("CT 확정 병변 1곳")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "확정 CT 병변 위치 1곳" })).toBeInTheDocument();
    expect(screen.getByText(/우상엽 · 13.2mm/)).toBeInTheDocument();
  });

  it("does not invent a lesion marker from draft CT observations", () => {
    const snapshot = { clinicalResults: [{ workflow_stage: "CT", result_status: "DRAFT", result_detail: { ct: { nodule_observations: [{ nodule_no: 1, lobe: "RUL" }] } } }], orders: [], aiResults: [] };
    expect(confirmedCtLesions(snapshot)).toEqual([]);
  });
});
