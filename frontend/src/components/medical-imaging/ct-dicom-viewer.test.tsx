import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CtDicomViewer } from "./ct-dicom-viewer";
import { ensureCornerstoneInitialized } from "@/app/radiology/_lib/cornerstone-init";

vi.mock("@/app/radiology/_lib/cornerstone-init", () => ({ ensureCornerstoneInitialized: vi.fn() }));

function dispatchContextMenu(element: Element) {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  element.dispatchEvent(event);
  return event;
}

function mockStreamingViewer() {
    const eventTarget = new EventTarget();
    const viewportElements = new Map<string, HTMLDivElement>();
    const loadedImages = new Set<string>();
    const pendingImages = new Map<string, () => void>();
    let currentAxialImageId = "image-3";
    let volumeId = "";
    const volume = { loadStatus: { loaded: false }, load: vi.fn<(callback: (event: { framesLoaded: number; framesProcessed: number; totalNumFrames: number; success: boolean }) => void) => void>() };
    const toolGroup = { addTool: vi.fn(), addViewport: vi.fn(), setToolActive: vi.fn(), setToolPassive: vi.fn() };
    const toolNames = ["WindowLevelTool", "PanTool", "ZoomTool", "StackScrollTool", "LengthTool", "RectangleROITool", "ArrowAnnotateTool", "TrackballRotateTool"];
    const tools = {
      ToolGroupManager: { getToolGroup: vi.fn(), createToolGroup: vi.fn(() => toolGroup), destroyToolGroup: vi.fn() },
      addTool: vi.fn(),
      annotation: { state: { getAnnotation: vi.fn(), removeAnnotation: vi.fn(), addAnnotation: vi.fn() }, config: { style: { setToolGroupToolStyles: vi.fn() } } },
      utilities: { triggerAnnotationRenderForViewportIds: vi.fn() },
      Enums: { MouseBindings: { Primary: 1, Secondary: 2, Auxiliary: 4, Wheel: 8 }, Events: {} },
      ...Object.fromEntries(toolNames.map((name) => [name, { toolName: name }])),
    };
    class RenderingEngine {
      id = "test-ct-engine";
      setViewports(entries: Array<{ viewportId: string; element: HTMLDivElement }>) {
        entries.forEach(({ viewportId, element }) => {
          viewportElements.set(viewportId, element);
          const surface = document.createElement("div");
          surface.className = "viewport-element";
          const canvas = document.createElement("canvas");
          canvas.className = "cornerstone-canvas";
          surface.append(canvas);
          element.append(surface);
        });
      }
      getViewport() { return { getDefaultActor: () => null, getCurrentImageId: () => currentAxialImageId, getCamera: () => ({}), resetCamera: vi.fn(), render: vi.fn() }; }
      getViewports() { return []; }
      render() {}
      resize() {}
      destroy() {}
    }
    const core = {
      RenderingEngine,
      Enums: { Events: { IMAGE_RENDERED: "CORNERSTONE_IMAGE_RENDERED", IMAGE_VOLUME_MODIFIED: "CORNERSTONE_IMAGE_VOLUME_MODIFIED", IMAGE_VOLUME_LOADING_COMPLETED: "CORNERSTONE_IMAGE_VOLUME_LOADING_COMPLETED", CAMERA_MODIFIED: "CORNERSTONE_CAMERA_MODIFIED", ERROR_EVENT: "CORNERSTONE_ERROR" }, ViewportType: { ORTHOGRAPHIC: "orthographic", VOLUME_3D: "volume3d" }, OrientationAxis: { AXIAL: "axial", CORONAL: "coronal", SAGITTAL: "sagittal" } },
      eventTarget,
      imageLoader: { loadAndCacheImage: vi.fn((imageId: string) => {
        if (imageId === "image-2" || imageId === "image-4") return new Promise((resolve) => {
          pendingImages.set(imageId, () => { loadedImages.add(imageId); resolve({}); });
        });
        loadedImages.add(imageId);
        return Promise.resolve({});
      }) },
      volumeLoader: { createAndCacheVolume: vi.fn(async (id: string) => { volumeId = id; return volume; }) },
      setVolumesForViewports: vi.fn().mockResolvedValue(undefined),
      cache: { isLoaded: (imageId: string) => loadedImages.has(imageId), getVolume: vi.fn(), removeVolumeLoadObject: vi.fn() },
      CONSTANTS: { VIEWPORT_PRESETS: [] },
    };
    vi.mocked(ensureCornerstoneInitialized).mockResolvedValue({ core, tools } as never);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });

    return {
      core,
      volume,
      viewportElements,
      loadedImages,
      setCurrentAxialImageId: (imageId: string) => { currentAxialImageId = imageId; },
      finishImage: (imageId: string) => pendingImages.get(imageId)?.(),
      completeVolume: (framesLoaded = loadedImages.size) => {
        volume.loadStatus.loaded = true;
        volume.load.mock.lastCall?.[0]({ framesLoaded, framesProcessed: 5, totalNumFrames: 5, success: framesLoaded === 5 });
        eventTarget.dispatchEvent(new CustomEvent("CORNERSTONE_IMAGE_VOLUME_LOADING_COMPLETED", { detail: { volumeId } }));
      },
    };
}

describe("CtDicomViewer toolbar", () => {
  it("shows Axial only for its cached current slice and waits for a complete volume in Coronal/Sagittal", async () => {
    const { core, volume, viewportElements, loadedImages, setCurrentAxialImageId, finishImage, completeVolume } = mockStreamingViewer();

    const { unmount } = render(<CtDicomViewer orderId="order-first-frame" assetId="asset-first-frame" analysisId="analysis-first-frame" loadSegmentation={() => new Promise(() => undefined)} loadSeries={async () => ({ imageIds: ["image-1", "image-2", "image-3", "image-4", "image-5"] })} />);
    const names = ["Axial", "Coronal", "Sagittal", "3D Volume"];
    const elements = names.map((name) => screen.getByLabelText(`CT ${name} viewer`));
    await waitFor(() => expect(viewportElements.size).toBe(4));
    await waitFor(() => expect(core.setVolumesForViewports).toHaveBeenCalledOnce());
    await waitFor(() => expect(volume.load).toHaveBeenCalledOnce());
    elements.forEach((element) => {
      expect(element).toHaveClass("[&_.cornerstone-canvas]:invisible");
      expect(element.parentElement).toHaveClass("bg-[#03060d]");
    });
    expect(elements[0].parentElement?.parentElement).toHaveClass("grid-cols-2", "grid-rows-2");

    act(() => elements.forEach((element) => element.dispatchEvent(new Event("CORNERSTONE_IMAGE_RENDERED"))));
    expect(elements[0]).not.toHaveClass("[&_.cornerstone-canvas]:invisible");
    expect(elements[1]).toHaveClass("[&_.cornerstone-canvas]:invisible");
    expect(elements[2]).toHaveClass("[&_.cornerstone-canvas]:invisible");
    expect(elements[3]).not.toHaveClass("[&_.cornerstone-canvas]:invisible");
    expect(elements[0].parentElement?.querySelector("canvas.z-10")).not.toHaveClass("hidden");
    expect(elements[1].parentElement?.querySelector("canvas.z-10")).toHaveClass("hidden");
    expect(elements[2].parentElement?.querySelector("canvas.z-10")).toHaveClass("hidden");

    setCurrentAxialImageId("image-2");
    act(() => elements[0].dispatchEvent(new Event("CORNERSTONE_CAMERA_MODIFIED")));
    expect(elements[0]).toHaveClass("[&_.cornerstone-canvas]:invisible");
    expect(elements[0].parentElement?.querySelector("canvas.z-10")).toHaveClass("hidden");
    await waitFor(() => expect(core.imageLoader.loadAndCacheImage).toHaveBeenCalledWith("image-2"));
    act(() => finishImage("image-2"));
    await waitFor(() => expect(loadedImages.has("image-2")).toBe(true));
    act(() => elements[0].dispatchEvent(new Event("CORNERSTONE_IMAGE_RENDERED")));
    expect(elements[0]).not.toHaveClass("[&_.cornerstone-canvas]:invisible");

    act(() => finishImage("image-4"));
    await waitFor(() => expect(loadedImages.has("image-4")).toBe(true));
    act(() => completeVolume());
    act(() => [elements[1], elements[2]].forEach((element) => element.dispatchEvent(new Event("CORNERSTONE_IMAGE_RENDERED"))));
    expect(elements[1]).not.toHaveClass("[&_.cornerstone-canvas]:invisible");
    expect(elements[2]).not.toHaveClass("[&_.cornerstone-canvas]:invisible");
    expect(elements[1].parentElement?.querySelector("canvas.z-10")).not.toHaveClass("hidden");
    expect(elements[2].parentElement?.querySelector("canvas.z-10")).not.toHaveClass("hidden");
    unmount();
    vi.unstubAllGlobals();
  });

  it("reports incomplete frames instead of revealing Coronal/Sagittal after a failed volume load", async () => {
    const { core, volume, viewportElements, completeVolume } = mockStreamingViewer();
    const { unmount } = render(<CtDicomViewer orderId="order-failed-frame" assetId="asset-failed-frame" loadSeries={async () => ({ imageIds: ["image-1", "image-2", "image-3", "image-4", "image-5"] })} />);
    await waitFor(() => expect(viewportElements.size).toBe(4));
    await waitFor(() => expect(volume.load).toHaveBeenCalledOnce());
    expect(core.cache.isLoaded("image-4")).toBe(false);
    act(() => completeVolume());
    act(() => ["Coronal", "Sagittal"].forEach((name) => screen.getByLabelText(`CT ${name} viewer`).dispatchEvent(new Event("CORNERSTONE_IMAGE_RENDERED"))));
    expect(screen.getByRole("alert")).toHaveTextContent("일부 CT 슬라이스를 불러오지 못했습니다.");
    expect(screen.getByLabelText("CT Coronal viewer")).toHaveClass("[&_.cornerstone-canvas]:invisible");
    expect(screen.getByLabelText("CT Sagittal viewer")).toHaveClass("[&_.cornerstone-canvas]:invisible");
    unmount();
    vi.unstubAllGlobals();
  });

  it("prevents the browser menu on every interactive viewport without stopping propagation", () => {
    render(<CtDicomViewer orderId="order-context" assetId="asset-context" loadSeries={() => new Promise(() => undefined)} />);

    for (const name of ["CT Axial viewer", "CT Coronal viewer", "CT Sagittal viewer", "CT 3D Volume viewer"]) {
      const viewport = screen.getByLabelText(name);
      const bubbled = vi.fn();
      viewport.parentElement?.addEventListener("contextmenu", bubbled);
      expect(dispatchContextMenu(viewport).defaultPrevented).toBe(true);
      expect(bubbled).toHaveBeenCalledOnce();
    }

    const axial = screen.getByLabelText("CT Axial viewer");
    for (const event of [
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 1 }),
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 }),
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 1 }),
    ]) {
      axial.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(dispatchContextMenu(screen.getByRole("toolbar")).defaultPrevented).toBe(false);
  });

  it("keeps context-menu suppression scoped after viewer unmount and remount", () => {
    const firstMount = render(<CtDicomViewer orderId="order-lifecycle" assetId="asset-lifecycle" loadSeries={() => new Promise(() => undefined)} />);
    expect(dispatchContextMenu(screen.getByLabelText("CT Axial viewer")).defaultPrevented).toBe(true);
    firstMount.unmount();

    const outsideEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
    document.body.dispatchEvent(outsideEvent);
    expect(outsideEvent.defaultPrevented).toBe(false);

    render(<CtDicomViewer orderId="order-lifecycle" assetId="asset-lifecycle" loadSeries={() => new Promise(() => undefined)} />);
    const viewport = screen.getByLabelText("CT Axial viewer");
    const bubbled = vi.fn();
    viewport.parentElement?.addEventListener("contextmenu", bubbled);
    expect(dispatchContextMenu(viewport).defaultPrevented).toBe(true);
    expect(bubbled).toHaveBeenCalledOnce();
  });

  it("renders the compact toolbar and toggles the layout controls", () => {
    render(<CtDicomViewer orderId="order-1" assetId="asset-1" loadSeries={() => new Promise(() => undefined)} />);

    expect(screen.getByRole("toolbar", { name: "CT Viewer 도구" })).toHaveClass("flex-wrap");
    expect(screen.getByRole("toolbar", { name: "CT Viewer 도구" })).not.toHaveClass("overflow-x-auto");
    expect(screen.getByRole("button", { name: "WL/WW" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "측정" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ROI" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "1×1" }));
    expect(screen.getByRole("button", { name: "1×1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "2×2" }));
    expect(screen.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses a viewport-sized fullscreen workspace", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: requestFullscreen });
    render(<CtDicomViewer orderId="order-fullscreen" assetId="asset-fullscreen" loadSeries={() => new Promise(() => undefined)} />);

    const button = screen.getByTitle("전체화면 (F)");
    const workspace = button.closest("div[tabindex='0']");
    expect(workspace).toHaveClass("fullscreen:h-screen", "fullscreen:w-screen");
    fireEvent.click(button);
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it("selects the first real nodule and allows switching the requested focus", () => {
    const onFocusedNoduleChange = vi.fn();
    render(
      <CtDicomViewer
        orderId="order-nodules"
        assetId="asset-nodules"
        loadSeries={() => new Promise(() => undefined)}
        nodules={[
          { nodule_no: 1, finding_payload: { quantification: { centroid_world_xyz_mm: [10, 20, 30] } } },
          { nodule_no: 2, finding_payload: { quantification: { centroid_world_xyz_mm: [40, 50, 60] } } },
        ]}
        onFocusedNoduleChange={onFocusedNoduleChange}
      />,
    );

    expect(screen.getByRole("button", { name: "결절 #1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "결절 #2" }));
    expect(screen.getByRole("button", { name: "결절 #2" })).toHaveAttribute("aria-pressed", "true");
    expect(onFocusedNoduleChange).toHaveBeenCalledWith("2");
  });

  it("omits the number when only one nodule is available", () => {
    render(
      <CtDicomViewer
        orderId="order-single-nodule"
        assetId="asset-single-nodule"
        loadSeries={() => new Promise(() => undefined)}
        nodules={[{ nodule_no: 1, finding_payload: { quantification: { centroid_world_xyz_mm: [10, 20, 30] } } }]}
      />,
    );

    expect(screen.getByRole("button", { name: "결절" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "결절 #1" })).toBeNull();
  });

  it("accepts an external nodule selection from the clinical detail rail", () => {
    const props = {
      orderId: "order-controlled",
      assetId: "asset-controlled",
      loadSeries: () => new Promise<never>(() => undefined),
      nodules: [
        { nodule_no: 1, finding_payload: { quantification: { centroid_world_xyz_mm: [10, 20, 30] } } },
        { nodule_no: 2, finding_payload: { quantification: { centroid_world_xyz_mm: [40, 50, 60] } } },
      ],
    };
    const { rerender } = render(<CtDicomViewer {...props} focusedNoduleId="1" />);

    rerender(<CtDicomViewer {...props} focusedNoduleId="2" />);
    expect(screen.getByRole("button", { name: "결절 #2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("deletes the server ID after saving a selected draft", () => {
    const onAnnotationDeleted = vi.fn().mockResolvedValue(true);
    const props = { orderId: "order-save", assetId: "asset-save", loadSeries: () => new Promise<never>(() => undefined), onAnnotationDeleted };
    const draft = { id: "temp-1", annotation_type: "TEXT" as const, annotation_data: { text: "메모", series_instance_uid: "series-1", sop_instance_uid: "sop-1", tool_name: "ArrowAnnotateTool" } };
    const { rerender } = render(<CtDicomViewer {...props} annotations={[draft]} />);
    fireEvent.click(screen.getByRole("button", { name: "Text 1" }));
    rerender(<CtDicomViewer {...props} annotations={[{ ...draft, id: "saved-1", clientId: "temp-1" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "선택 삭제" }));
    expect(onAnnotationDeleted).toHaveBeenCalledWith("saved-1");
  });

  it("selects a saved text annotation before updating or deleting it", () => {
    const onAnnotationUpdated = vi.fn();
    const onAnnotationDeleted = vi.fn();
    render(
      <CtDicomViewer
        orderId="order-1"
        assetId="asset-1"
        loadSeries={() => new Promise(() => undefined)}
        annotations={[{
          id: "annotation-1",
          annotation_type: "TEXT",
          annotation_data: { text: "기존 메모", series_instance_uid: "series-1", sop_instance_uid: "sop-1", tool_name: "ArrowAnnotateTool" },
        }]}
        onAnnotationUpdated={onAnnotationUpdated}
        onAnnotationDeleted={onAnnotationDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Text 1" }));
    const text = screen.getByRole("textbox", { name: "선택한 텍스트 주석 내용" });
    expect(text).toHaveValue("기존 메모");
    fireEvent.change(text, { target: { value: "수정 메모" } });
    expect(onAnnotationUpdated).toHaveBeenCalledWith("annotation-1", expect.objectContaining({ annotation_type: "TEXT", annotation_data: expect.objectContaining({ text: "수정 메모" }) }));
    fireEvent.click(screen.getByRole("button", { name: "선택 삭제" }));
    expect(onAnnotationDeleted).toHaveBeenCalledWith("annotation-1");
  });
});
