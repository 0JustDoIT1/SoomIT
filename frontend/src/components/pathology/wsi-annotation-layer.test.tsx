import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type OpenSeadragonType from "openseadragon";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WsiAnnotationLayer, type WsiAnnotation } from "./wsi-annotation-layer";

const baseAnnotation: WsiAnnotation = {
  id: "annotation-1",
  image_asset: "asset-1",
  annotation_type: "POINT",
  annotation_data: {
    coordinate_space: "WSI_IMAGE",
    slide_id: "slide-1",
    image_width: 1000,
    image_height: 800,
    image_points: [[100, 200]],
    tool_name: "WsiPoint",
  },
};

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function viewer() {
  return {
    addHandler: vi.fn(),
    removeHandler: vi.fn(),
    setMouseNavEnabled: vi.fn(),
    viewport: {
      pointFromPixel: vi.fn((point: { x: number; y: number }) => point),
      viewportToImageCoordinates: vi.fn((point: { x: number; y: number }) => point),
      imageToViewerElementCoordinates: vi.fn((point: { x: number; y: number }) => point),
    },
  } as unknown as OpenSeadragonType.Viewer;
}

function setup(authorizedFetch = vi.fn().mockResolvedValue(response([])), writable = true) {
  const toolbar = document.createElement("div");
  document.body.appendChild(toolbar);
  const result = render(<div className="relative h-[400px] w-[500px]">
    <WsiAnnotationLayer
      viewer={viewer()}
      toolbarElement={toolbar}
      endpoint="/api/pathology/wsis/slide-1/annotations/"
      imageAssetId="asset-1"
      slideId="slide-1"
      imageWidth={1000}
      imageHeight={800}
      authorizedFetch={authorizedFetch}
      writable={writable}
    />
  </div>);
  return { ...result, authorizedFetch, toolbar };
}

afterEach(() => {
  document.documentElement.dataset.theme = "light";
});

describe("WsiAnnotationLayer", () => {
  it("restores multiple annotations in WSI image coordinates and keeps a separate annotation layer", async () => {
    const second = { ...baseAnnotation, id: "annotation-2", annotation_type: "TEXT" as const, annotation_data: { ...baseAnnotation.annotation_data, text: "tumor", tool_name: "WsiText" } };
    setup(vi.fn().mockResolvedValue(response([baseAnnotation, second])));

    await waitFor(() => expect(screen.getByText("2개")).toBeInTheDocument());
    expect(screen.getByLabelText("WSI Annotation layer")).toHaveAttribute("data-wsi-layer", "annotation");
    expect(screen.getByText("tumor")).toBeInTheDocument();
  });

  it("creates point, ROI, freehand and text payloads with original-image coordinates", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockImplementation(async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body));
        return response({ id: `saved-${payload.annotation_type}`, ...payload });
      });
    setup(authorizedFetch);
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(1));
    const layer = screen.getByLabelText("WSI Annotation layer");

    fireEvent.click(screen.getByRole("button", { name: "Point" }));
    fireEvent.pointerDown(layer, { clientX: 25, clientY: 30, pointerId: 1 });
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "ROI" }));
    fireEvent.pointerDown(layer, { clientX: 10, clientY: 20, pointerId: 2 });
    fireEvent.pointerMove(layer, { clientX: 40, clientY: 60, pointerId: 2 });
    fireEvent.pointerUp(layer, { clientX: 40, clientY: 60, pointerId: 2 });
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole("button", { name: "Freehand" }));
    fireEvent.pointerDown(layer, { clientX: 1, clientY: 2, pointerId: 3 });
    fireEvent.pointerMove(layer, { clientX: 3, clientY: 4, pointerId: 3 });
    fireEvent.pointerUp(layer, { pointerId: 3 });
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(4));

    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.change(screen.getByLabelText("Annotation text"), { target: { value: "  tumor edge  " } });
    fireEvent.pointerDown(layer, { clientX: 70, clientY: 80, pointerId: 4 });
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(5));

    const payloads = authorizedFetch.mock.calls.slice(1).map((call) => JSON.parse(String(call[1]?.body)));
    expect(payloads.map((payload) => payload.annotation_type)).toEqual(["POINT", "BOUNDING_BOX", "FREEHAND", "TEXT"]);
    expect(payloads[1].annotation_data.image_points).toEqual([[10, 20], [40, 20], [40, 60], [10, 60]]);
    expect(payloads[3].annotation_data.text).toBe("tumor edge");
    expect(payloads.every((payload) => payload.annotation_data.coordinate_space === "WSI_IMAGE")).toBe(true);
  });

  it("builds a polygon across clicks and preserves earlier annotations", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response([baseAnnotation]))
      .mockImplementation(async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body));
        return response({ id: "polygon-1", ...payload });
      });
    setup(authorizedFetch);
    await waitFor(() => expect(screen.getByText("1개")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Polygon" }));
    const layer = screen.getByLabelText("WSI Annotation layer");
    fireEvent.pointerDown(layer, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerDown(layer, { clientX: 30, clientY: 10, pointerId: 2 });
    fireEvent.pointerDown(layer, { clientX: 20, clientY: 40, pointerId: 3 });
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.getByText("2개")).toBeInTheDocument());
  });

  it("does not persist an empty or whitespace-only text annotation", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(response([]));
    setup(authorizedFetch);
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.change(screen.getByLabelText("Annotation text"), { target: { value: "   " } });
    fireEvent.pointerDown(screen.getByLabelText("WSI Annotation layer"), { clientX: 20, clientY: 30, pointerId: 1 });
    expect(await screen.findByRole("alert")).toHaveTextContent("공백으로 저장할 수 없습니다");
    expect(authorizedFetch).toHaveBeenCalledTimes(1);
  });

  it("selects and deletes one annotation without removing the others", async () => {
    const second = { ...baseAnnotation, id: "annotation-2", annotation_data: { ...baseAnnotation.annotation_data, image_points: [[300, 400]] as [number, number][] } };
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(response([baseAnnotation, second]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    setup(authorizedFetch);
    await waitFor(() => expect(screen.getByText("2개")).toBeInTheDocument());
    const circles = document.querySelectorAll("circle");
    fireEvent.pointerDown(circles[0]);
    fireEvent.click(screen.getByRole("button", { name: "선택 삭제" }));
    await waitFor(() => expect(screen.getByText("1개")).toBeInTheDocument());
    expect(String(authorizedFetch.mock.calls[1][0])).toContain("annotation-1");
  });

  it("keeps pan available in read-only mode and reports annotation failure without replacing the viewer", async () => {
    setup(vi.fn().mockResolvedValue(response({ detail: "failed" }, 503)), false);
    expect(screen.getByRole("button", { name: "이동" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Point" })).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent("WSI는 계속 사용할 수 있습니다.");
    expect(screen.getByLabelText("WSI Annotation layer")).toBeInTheDocument();
  });

  it("uses the server permission flag and remains readable in dark mode", async () => {
    document.documentElement.dataset.theme = "dark";
    setup(vi.fn().mockResolvedValue(response([baseAnnotation], 200, { "X-Annotation-Writable": "false" })));
    await waitFor(() => expect(screen.getByText("1개")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Point" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "선택 삭제" })).toBeDisabled();
  });

  it("reprojects stored image coordinates after OpenSeadragon zoom or pan", async () => {
    let scale = 1;
    const mockViewer = viewer() as unknown as {
      addHandler: ReturnType<typeof vi.fn>;
      viewport: { imageToViewerElementCoordinates: ReturnType<typeof vi.fn> };
    };
    mockViewer.viewport.imageToViewerElementCoordinates.mockImplementation((point: { x: number; y: number }) => ({ x: point.x * scale, y: point.y * scale }));
    const toolbar = document.createElement("div");
    document.body.appendChild(toolbar);
    render(<div className="relative h-96"><WsiAnnotationLayer viewer={mockViewer as unknown as OpenSeadragonType.Viewer} toolbarElement={toolbar} endpoint="/annotations/" imageAssetId="asset-1" slideId="slide-1" imageWidth={1000} imageHeight={800} authorizedFetch={vi.fn().mockResolvedValue(response([baseAnnotation]))} writable /></div>);
    await waitFor(() => expect(document.querySelector("circle")).toHaveAttribute("cx", "100"));

    scale = 2;
    const animationHandler = mockViewer.addHandler.mock.calls.find(([event]) => event === "animation")?.[1] as (() => void);
    animationHandler();
    await waitFor(() => expect(document.querySelector("circle")).toHaveAttribute("cx", "200"));
  });

  it("ignores a late annotation response after the active slide changes", async () => {
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<Response>((resolve) => { resolveSecond = resolve; });
    const authorizedFetch = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const toolbar = document.createElement("div");
    document.body.appendChild(toolbar);
    const mockViewer = viewer();
    const { rerender } = render(<div className="relative h-96"><WsiAnnotationLayer viewer={mockViewer} toolbarElement={toolbar} endpoint="/slides/slide-1/annotations/" imageAssetId="asset-1" slideId="slide-1" imageWidth={1000} imageHeight={800} authorizedFetch={authorizedFetch} writable /></div>);
    rerender(<div className="relative h-96"><WsiAnnotationLayer viewer={mockViewer} toolbarElement={toolbar} endpoint="/slides/slide-2/annotations/" imageAssetId="asset-2" slideId="slide-2" imageWidth={1000} imageHeight={800} authorizedFetch={authorizedFetch} writable /></div>);

    resolveSecond(response([{ ...baseAnnotation, id: "slide-2-annotation", image_asset: "asset-2", annotation_data: { ...baseAnnotation.annotation_data, slide_id: "slide-2", image_points: [[300, 400]] } }]));
    await waitFor(() => expect(document.querySelector("circle")).toHaveAttribute("cx", "300"));
    resolveFirst(response([baseAnnotation]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector("circle")).toHaveAttribute("cx", "300");
  });
});
