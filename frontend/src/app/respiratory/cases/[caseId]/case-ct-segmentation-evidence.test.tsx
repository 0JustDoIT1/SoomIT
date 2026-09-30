import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { CaseCtSegmentationEvidence } from "./case-ct-segmentation-evidence";

const addDicomFile = vi.hoisted(() => vi.fn((file: File) => `wadouri:${file.name}`));
const addDicomMetadata = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/toast/toast", () => ({
  showToast: { error: toastError, success: vi.fn() },
}));

vi.mock("@/app/radiology/_lib/cornerstone-init", () => ({
  ensureCornerstoneInitialized: vi.fn().mockResolvedValue({
    dicomImageLoader: {
      wadouri: { fileManager: { add: addDicomFile } },
      wadors: { metaDataManager: { add: addDicomMetadata } },
    },
  }),
}));

vi.mock("@/components/medical-imaging/ct-dicom-viewer", () => ({
  CtDicomViewer: ({ orderId, assetId, loadSeries, loadSegmentation, annotations = [], focusedNoduleId, onFocusedNoduleChange, onAnnotationDeleted, onAllAnnotationsDeleted, onAnnotationUpdated, onAnnotationCreated }: {
    orderId: string;
    assetId: string;
    loadSeries: (orderId: string, assetId: string) => Promise<unknown>;
    loadSegmentation: (analysisId: string) => Promise<unknown>;
    annotations?: Array<{ id: string }>;
    onAnnotationCreated?: (annotation: { annotation_type: "LENGTH"; annotation_data: Record<string, unknown> }) => unknown;
    focusedNoduleId?: string | null;
    onFocusedNoduleChange?: (noduleId: string) => void;
    onAnnotationDeleted?: (annotationId: string) => Promise<boolean> | boolean;
    onAllAnnotationsDeleted?: () => Promise<boolean> | boolean;
    onAnnotationUpdated?: (annotationId: string, annotation: { annotation_type: "LENGTH"; annotation_data: Record<string, unknown> }) => Promise<boolean> | boolean | void;
  }) => <div data-testid="ct-viewer">
    <button onClick={() => onAnnotationCreated?.({ annotation_type: "LENGTH", annotation_data: {} })}>create-annotation</button>
    <button type="button" onClick={() => void loadSeries(orderId, assetId)}>load-series</button>
    <button type="button" onClick={() => void loadSegmentation("analysis-cache")}>load-segmentation</button>
    <span data-testid="annotation-ids">{annotations.map(({ id }) => id).join(",")}</span>
    <button type="button" onClick={() => void onAnnotationDeleted?.(annotations[0]?.id ?? "")}>delete-annotation</button>
    <button type="button" onClick={() => void onAllAnnotationsDeleted?.()}>delete-all-annotations</button>
    <button type="button" onClick={() => void onAnnotationUpdated?.(annotations[0]?.id ?? "", { annotation_type: "LENGTH", annotation_data: {} })}>update-annotation</button>
    <span data-testid="focused-nodule">{focusedNoduleId}</span>
    <button type="button" onClick={() => onFocusedNoduleChange?.("2")}>focus-nodule-2</button>
  </div>,
}));

vi.mock("./case-ct-visualization", () => ({ CaseCtVisualization: () => <div>3D visualization</div> }));

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

it("retains a newly drawn annotation when the initial GET finishes later", async () => {
  let finishLoad!: (response: Response) => void;
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/image-assets/")) return json([{ id: "asset-race", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: "series-race" }]);
    if (String(input).includes("/image-annotations/")) return new Promise<Response>((resolve) => { finishLoad = resolve; });
    return json([]);
  });
  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-load-race" />);
  fireEvent.click(await screen.findByRole("button", { name: "create-annotation" }));
  const draftId = screen.getByTestId("annotation-ids").textContent;
  expect(draftId).toContain("temp-");
  await act(async () => finishLoad(json([{ id: "existing", annotation_type: "LENGTH", annotation_data: {} }])));
  expect(screen.getByTestId("annotation-ids")).toHaveTextContent(draftId!);
  expect(screen.getByTestId("annotation-ids")).toHaveTextContent("existing");
});

function dicomSeries(uids: string[]) {
  const boundary = "test-dicom-series";
  const body = uids.map((uid, index) => `--${boundary}\r\nContent-Type: application/dicom\r\nContent-Location: /instances/${uid}\r\n\r\n${index + 1}\r\n`).join("") + `--${boundary}--\r\n`;
  return new Response(body, { headers: { "Content-Type": `multipart/related; type="application/dicom"; boundary=${boundary}` } });
}

function createFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "asset-cache", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: "series-cache" }]);
    if (url.includes("/image-annotations/")) return json([]);
    if (url.endsWith("/dicom-web/metadata/")) return json([
      { "00080018": { Value: ["sop-2"] }, "00200013": { Value: [2] }, "00200032": { Value: [0, 0, 2] } },
      { "00080018": { Value: ["sop-1"] }, "00200013": { Value: [1] }, "00200032": { Value: [0, 0, 1] } },
    ]);
    if (url.endsWith("/dicom-web/instances/")) return json([
      { "00080018": { Value: ["sop-1"] } },
      { "00080018": { Value: ["sop-2"] } },
    ]);
    if (url.endsWith("/dicom-web/series/")) return dicomSeries(["sop-1", "sop-2"]);
    if (url.includes("/dicom-web/instances/")) return new Response(new Blob([new Uint8Array([1])]));
    if (url.endsWith("/segmentation/")) return json({
      schema_version: "test",
      scalar_type: "uint8",
      dimensions: [1, 1, 1],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      segments: [{ segment_index: 1, id: "N001", name: "Nodule", category: "NODULE", color: [255, 0, 0] }],
    });
    if (url.endsWith("/segmentation/labelmap/")) return new Response(new Uint8Array([1]));
    throw new Error(`Unexpected URL: ${url}`);
  });
}

beforeEach(() => {
  toastError.mockClear();
  addDicomMetadata.mockClear();
});

it("reuses CT series and segmentation requests after remounting the same Case series", async () => {
  const authorizedFetch = createFetch();
  const props = { apiBaseUrl: "http://test", authorizedFetch, caseId: "case-cache", analysisId: "analysis-cache" };
  const first = render(<CaseCtSegmentationEvidence {...props} />);

  fireEvent.click(await screen.findByRole("button", { name: "load-series" }));
  fireEvent.click(screen.getByRole("button", { name: "load-segmentation" }));
  await waitFor(() => expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/dicom-web/metadata/"))).toHaveLength(1));
  expect(addDicomMetadata).toHaveBeenCalledTimes(2);
  expect(addDicomMetadata.mock.calls[0][0]).toContain("/instances/sop-1/frames/1/");
  await waitFor(() => expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/segmentation/"))).toHaveLength(2));
  first.unmount();

  render(<CaseCtSegmentationEvidence {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "load-series" }));
  fireEvent.click(screen.getByRole("button", { name: "load-segmentation" }));

  await waitFor(() => expect(authorizedFetch.mock.calls.filter(([url]) => String(url).endsWith("/image-assets/"))).toHaveLength(1));
  expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/dicom-web/metadata/"))).toHaveLength(1);
  expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/frames/1/"))).toHaveLength(1);
  expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/dicom-web/series/"))).toHaveLength(0);
  expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/segmentation/"))).toHaveLength(2);
  expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/image-annotations/"))).toHaveLength(1);
  expect(String(authorizedFetch.mock.calls.find(([url]) => String(url).includes("/image-annotations/"))?.[0])).toContain("series_instance_uid=series-cache");
  expect(toastError).not.toHaveBeenCalled();
});

it("falls back to full DICOM instances when the frame streaming route is unavailable", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const baseFetch = createFetch();
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/frames/1/") && init?.method === "HEAD") return json({}, 404);
    return baseFetch(input);
  });

  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-frame-fallback" analysisId="analysis-frame-fallback" />);
  fireEvent.click(await screen.findByRole("button", { name: "load-series" }));

  await waitFor(() => expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/dicom-web/series/"))).toHaveLength(1));
  expect(addDicomMetadata).not.toHaveBeenCalled();
});

it("keeps the original CT viewer mounted while visiting the 3D view", async () => {
  const authorizedFetch = createFetch();
  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-view-toggle" analysisId="analysis-view-toggle" />);

  expect(await screen.findByTestId("ct-viewer")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "분할 / 3D" }));
  expect(screen.getByTestId("ct-viewer")).toBeInTheDocument();
  expect(screen.getByText("3D visualization")).toBeInTheDocument();
});

it("prefetches segmentation while the original CT series is being prepared", async () => {
  const authorizedFetch = createFetch();
  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-seg-prefetch" analysisId="analysis-seg-prefetch" />);

  expect(await screen.findByTestId("ct-viewer")).toBeInTheDocument();
  await waitFor(() => expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/segmentation/"))).toHaveLength(2));
});

it("retries a transient labelmap storage failure", async () => {
  let labelmapAttempts = 0;
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "asset-seg-retry", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: "series-seg-retry" }]);
    if (url.includes("/image-annotations/")) return json([]);
    if (url.endsWith("/segmentation/")) return json({ scalar_type: "uint8", dimensions: [1, 1, 1], spacing: [1, 1, 1], origin: [0, 0, 0], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], segments: [] });
    if (url.endsWith("/segmentation/labelmap/")) {
      labelmapAttempts += 1;
      return labelmapAttempts === 1 ? json({ detail: "storage unavailable" }, 502) : new Response(new Uint8Array([1]));
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-seg-retry" analysisId="analysis-seg-retry" />);

  await waitFor(() => expect(labelmapAttempts).toBe(2), { timeout: 2_000 });
});

it("keeps the result rail and CT viewer nodule selection connected", async () => {
  const authorizedFetch = createFetch();
  const onSelectedNoduleChange = vi.fn();
  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-selection" analysisId="analysis-selection" selectedNoduleId="1" onSelectedNoduleChange={onSelectedNoduleChange} />);

  expect(await screen.findByTestId("focused-nodule")).toHaveTextContent("1");
  fireEvent.click(screen.getByRole("button", { name: "focus-nodule-2" }));
  expect(onSelectedNoduleChange).toHaveBeenCalledWith("2");
});

it("does not request annotations before the Series UID is ready", async () => {
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) {
      return json([{ id: "asset-no-series", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: null }]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-no-series" />);

  expect(await screen.findByTestId("ct-viewer")).toBeInTheDocument();
  expect(authorizedFetch.mock.calls.some(([url]) => String(url).includes("/image-annotations/"))).toBe(false);
  expect(toastError).not.toHaveBeenCalled();
});

it("passes successful annotations to the CT overlay without affecting segmentation", async () => {
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "asset-overlay", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: "series-overlay" }]);
    if (url.includes("/image-annotations/")) return json([{ id: "annotation-overlay", annotation_type: "LENGTH", annotation_data: {} }]);
    if (url.endsWith("/segmentation/")) return json({ scalar_type: "uint8", dimensions: [1, 1, 1] });
    if (url.endsWith("/segmentation/labelmap/")) return new Response(new Uint8Array([1]));
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-overlay" analysisId="analysis-overlay" />);

  await waitFor(() => expect(screen.getByTestId("annotation-ids")).toHaveTextContent("annotation-overlay"));
  fireEvent.click(screen.getByRole("button", { name: "분할 / 3D" }));
  expect(screen.getByTestId("ct-viewer")).toBeInTheDocument();
  expect(screen.getByText("3D visualization")).toBeInTheDocument();
});

it("removes a deleted CT annotation and sends only one delete request for repeated events", async () => {
  let deleted = false;
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "asset-delete", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: "series-delete" }]);
    if (url.includes("/image-annotations/")) {
      if (init?.method === "DELETE") {
        const status = deleted ? 404 : 204;
        deleted = true;
        return new Response(null, { status });
      }
      return json(deleted ? [] : [{ id: "annotation-delete", annotation_type: "LENGTH", annotation_data: {} }]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-delete" />);

  await waitFor(() => expect(screen.getByTestId("annotation-ids")).toHaveTextContent("annotation-delete"));
  fireEvent.click(screen.getByRole("button", { name: "delete-annotation" }));
  fireEvent.click(screen.getByRole("button", { name: "delete-annotation" }));
  await waitFor(() => expect(screen.getByTestId("annotation-ids")).toBeEmptyDOMElement());
  expect(authorizedFetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
  expect(toastError).not.toHaveBeenCalled();
});

it("deletes all CT annotations only after confirmation", async () => {
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "asset-delete-all", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: "series-delete-all" }]);
    if (url.includes("/image-annotations/") && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (url.includes("/image-annotations/")) return json([{ id: "annotation-delete-all", annotation_type: "LENGTH", annotation_data: {} }]);
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-delete-all" />);
  await waitFor(() => expect(screen.getByTestId("annotation-ids")).toHaveTextContent("annotation-delete-all"));
  fireEvent.click(screen.getByRole("button", { name: "delete-all-annotations" }));
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("alertdialog").querySelectorAll("button")[1]);

  await waitFor(() => expect(screen.getByTestId("annotation-ids")).toBeEmptyDOMElement());
  expect(authorizedFetch.mock.calls.some(([url, init]) => String(url).includes("series_instance_uid=series-delete-all") && init?.method === "DELETE")).toBe(true);
});

it("keeps an edited annotation local until the explicit save action", async () => {
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "asset-stale-update", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: "series-stale-update" }]);
    if (url.includes("/image-annotations/")) {
      if (init?.method === "PATCH") return json({ detail: "Not found." }, 404);
      return json([{ id: "annotation-stale-update", annotation_type: "LENGTH", annotation_data: {} }]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-stale-update" />);

  await waitFor(() => expect(screen.getByTestId("annotation-ids")).toHaveTextContent("annotation-stale-update"));
  fireEvent.click(screen.getByRole("button", { name: "update-annotation" }));
  expect(screen.getByTestId("annotation-ids")).toHaveTextContent("annotation-stale-update");
  expect(authorizedFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  expect(toastError).not.toHaveBeenCalled();
});

it("keeps the CT viewer usable and reports one toast for a repeated failed request", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  let annotationRequestCount = 0;
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "asset-failure", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: "series-failure" }]);
    if (url.includes("/image-annotations/")) {
      annotationRequestCount += 1;
      return annotationRequestCount === 1 ? json({ detail: "Annotation endpoint unavailable." }, 503) : json([]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const props = { apiBaseUrl: "http://test", authorizedFetch, caseId: "case-failure", analysisId: "analysis-failure" };

  const first = render(<CaseCtSegmentationEvidence {...props} />);
  expect(await screen.findByRole("button", { name: "주석 조회 재시도" })).toBeInTheDocument();
  expect(screen.getByTestId("ct-viewer")).toBeInTheDocument();
  first.unmount();
  render(<CaseCtSegmentationEvidence {...props} />);

  expect(await screen.findByRole("button", { name: "주석 조회 재시도" })).toBeInTheDocument();
  expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/image-annotations/"))).toHaveLength(1);
  expect(toastError).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "주석 조회 재시도" }));
  await waitFor(() => expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/image-annotations/"))).toHaveLength(2));
  await waitFor(() => expect(screen.queryByRole("button", { name: "주석 조회 재시도" })).not.toBeInTheDocument());
});
