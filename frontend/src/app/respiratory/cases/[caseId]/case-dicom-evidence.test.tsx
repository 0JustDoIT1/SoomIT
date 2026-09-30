import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { CaseDicomEvidence } from "./case-dicom-evidence";
import { ensureCornerstoneInitialized } from "../../../radiology/_lib/cornerstone-init";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/toast/toast", () => ({
  showToast: { error: toastError, success: vi.fn() },
}));

vi.mock("../../../radiology/_lib/cornerstone-init", () => ({
  ensureCornerstoneInitialized: vi.fn(),
}));

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  toastError.mockClear();
  vi.mocked(ensureCornerstoneInitialized).mockReset();
});

it("captures real core annotation events without reloading the image and serializes saves", async () => {
  const eventTarget = new EventTarget();
  const viewport = { setStack: vi.fn().mockResolvedValue(undefined), render: vi.fn() };
  const group = { addTool: vi.fn(), addViewport: vi.fn(), setToolPassive: vi.fn(), setToolActive: vi.fn() };
  const engineCreated = vi.fn();
  class RenderingEngine {
    id = "engine";
    constructor() { engineCreated(); }
    enableElement() {}
    getViewport() { return viewport; }
    destroy() {}
  }
  const tools = {
    ...Object.fromEntries(["WindowLevel", "Pan", "Zoom", "Length", "RectangleROI", "ArrowAnnotate"].map((name) => [`${name}Tool`, { toolName: name }])),
    addTool: vi.fn(),
    ToolGroupManager: { getToolGroup: vi.fn(), createToolGroup: () => group, destroyToolGroup: vi.fn() },
    Enums: { MouseBindings: { Primary: 1 }, Events: { ANNOTATION_COMPLETED: "completed", ANNOTATION_MODIFIED: "modified" } },
    annotation: { state: { addAnnotation: vi.fn(), removeAnnotation: vi.fn() } },
  };
  vi.mocked(ensureCornerstoneInitialized).mockResolvedValue({
    core: { eventTarget, RenderingEngine, Enums: { ViewportType: { STACK: "stack" } } }, tools,
    dicomImageLoader: { wadouri: { fileManager: { add: () => "image-1" } } },
  } as unknown as Awaited<ReturnType<typeof ensureCornerstoneInitialized>>);
  let finishSave!: (response: Response) => void;
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") return new Promise<Response>((resolve) => { finishSave = resolve; });
    if (url.endsWith("/image-assets/")) return json([{ id: "pet-events", workflow_stage: "PET_CT_TNM", image_type: "PET", status: "READY", series_instance_uid: "series-events" }]);
    if (url.endsWith("/dicom-web/instances/")) return json([{ "00080018": { Value: ["sop-1"] } }]);
    if (url.endsWith("/instances/sop-1/")) return new Response(new Blob(["dicom"]));
    if (url.includes("/image-annotations/")) return json([]);
    throw new Error(url);
  });
  render(<CaseDicomEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-events" stage="PET_CT_TNM" />);
  await waitFor(() => expect(viewport.setStack).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "ROI" }));
  act(() => eventTarget.dispatchEvent(new CustomEvent("completed", { detail: { annotation: {
    annotationUID: "drawn-1", metadata: { toolName: "RectangleROI", referencedImageId: "image-1" },
    data: { handles: { points: [[0, 0, 0], [1, 1, 1]] } },
  } } })));
  const save = screen.getByRole("button", { name: "주석 저장" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  fireEvent.click(save);
  expect(authorizedFetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await act(async () => finishSave(json({ id: "saved-1", annotation_type: "BOUNDING_BOX", annotation_data: { sop_instance_uid: "sop-1", world_points: [[0, 0, 0], [1, 1, 1]] } })));
  expect(engineCreated).toHaveBeenCalledOnce();
  expect(authorizedFetch.mock.calls.filter(([url]) => String(url).endsWith("/instances/sop-1/"))).toHaveLength(1);
  expect(save).toBeDisabled();
});

it("prevents the browser menu only on the PET/CT Cornerstone surface", () => {
  const authorizedFetch = vi.fn(() => new Promise<Response>(() => undefined));
  render(<CaseDicomEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-context-menu" stage="PET_CT_TNM" />);

  const viewer = screen.getByLabelText("DICOM 원본 영상 뷰어. 좌우 화살표로 슬라이스 이동");
  const bubbled = vi.fn();
  viewer.parentElement?.addEventListener("contextmenu", bubbled);
  const viewerEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  viewer.dispatchEvent(viewerEvent);
  expect(viewerEvent.defaultPrevented).toBe(true);
  expect(bubbled).toHaveBeenCalledOnce();

  const outsideEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  screen.getByRole("heading", { level: 2 }).dispatchEvent(outsideEvent);
  expect(outsideEvent.defaultPrevented).toBe(false);
});

it("loads an empty PET annotation list with the selected asset and Series UID", async () => {
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "pet-empty", workflow_stage: "PET_CT_TNM", image_type: "PET", file_format: "DICOM", status: "READY", series_instance_uid: "series-pet-empty" }]);
    if (url.endsWith("/dicom-web/instances/")) return json([]);
    if (url.includes("/image-annotations/")) return json([]);
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<CaseDicomEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-pet-empty" stage="PET_CT_TNM" />);

  await waitFor(() => expect(authorizedFetch.mock.calls.some(([url]) => String(url).includes("/image-annotations/"))).toBe(true));
  const annotationUrl = String(authorizedFetch.mock.calls.find(([url]) => String(url).includes("/image-annotations/"))?.[0]);
  expect(annotationUrl).toContain("image_asset_id=pet-empty");
  expect(annotationUrl).toContain("series_instance_uid=series-pet-empty");
  expect(toastError).not.toHaveBeenCalled();
});

it("deletes every PET/CT annotation for the selected series after confirmation", async () => {
  const annotation = { id: "annotation-1", annotation_type: "LENGTH", annotation_data: { sop_instance_uid: "sop-1" } };
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "pet-with-annotation", workflow_stage: "PET_CT_TNM", image_type: "PET", file_format: "DICOM", status: "READY", series_instance_uid: "series-pet" }]);
    if (url.endsWith("/dicom-web/instances/")) return json([]);
    if (url.includes("/image-annotations/") && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (url.includes("/image-annotations/")) return json([annotation]);
    throw new Error(`Unexpected URL: ${url}`);
  });
  render(<CaseDicomEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-pet" stage="PET_CT_TNM" />);
  const button = await screen.findByRole("button", { name: "전체 삭제" });
  await waitFor(() => expect(button).toBeEnabled());

  fireEvent.click(button);
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "전체 삭제" })[1]);

  await waitFor(() => expect(authorizedFetch.mock.calls.some(([url, init]) => String(url).includes("image_asset_id=pet-with-annotation") && init?.method === "DELETE")).toBe(true));
  expect(button).toBeDisabled();
});

it("does not request PET annotations before the Series UID is ready", async () => {
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "pet-no-series", workflow_stage: "PET_CT_TNM", image_type: "PET", file_format: "DICOM", status: "READY", series_instance_uid: null }]);
    if (url.endsWith("/dicom-web/instances/")) return json([]);
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<CaseDicomEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-pet-no-series" stage="PET_CT_TNM" />);

  expect(await screen.findByRole("button", { name: "PET Series" })).toBeInTheDocument();
  expect(authorizedFetch.mock.calls.some(([url]) => String(url).includes("/image-annotations/"))).toBe(false);
  expect(toastError).not.toHaveBeenCalled();
});

it("ignores a failed stale annotation response after selecting another series", async () => {
  let resolveFirstAnnotation!: (response: Response) => void;
  const authorizedFetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return Promise.resolve(json([
      { id: "ct-old", workflow_stage: "PET_CT_TNM", image_type: "CT", file_format: "DICOM", status: "READY", series_instance_uid: "series-old" },
      { id: "pet-current", workflow_stage: "PET_CT_TNM", image_type: "PET", file_format: "DICOM", status: "READY", series_instance_uid: "series-current" },
    ]));
    if (url.endsWith("/dicom-web/instances/")) return Promise.resolve(json([]));
    if (url.includes("image_asset_id=ct-old")) {
      return new Promise<Response>((resolve) => {
        resolveFirstAnnotation = resolve;
      });
    }
    if (url.includes("image_asset_id=pet-current")) return Promise.resolve(json([]));
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  render(<CaseDicomEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-series-switch" stage="PET_CT_TNM" />);
  fireEvent.click(await screen.findByRole("button", { name: "PET Series" }));
  await waitFor(() => expect(authorizedFetch.mock.calls.some(([url]) => String(url).includes("image_asset_id=pet-current"))).toBe(true));

  await act(async () => {
    resolveFirstAnnotation(json({ detail: "Old series failed." }, 503));
    await Promise.resolve();
  });
  expect(screen.queryByText("주석 조회 불가")).not.toBeInTheDocument();
  expect(toastError).not.toHaveBeenCalled();
});
