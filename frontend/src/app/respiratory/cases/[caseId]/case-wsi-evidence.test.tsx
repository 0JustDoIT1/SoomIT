import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearWsiViewportCacheForTests } from "@/components/pathology/wsi-viewer";
import { CaseWsiEvidence } from "./case-wsi-evidence";

type ViewerMock = {
  addHandler: ReturnType<typeof vi.fn>;
  removeHandler: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  forceRedraw: ReturnType<typeof vi.fn>;
  setMouseNavEnabled: ReturnType<typeof vi.fn>;
  addOverlay: ReturnType<typeof vi.fn>;
  removeOverlay: ReturnType<typeof vi.fn>;
  world: { removeItem: ReturnType<typeof vi.fn> };
  isDestroyed: () => boolean;
  viewport: Record<string, ReturnType<typeof vi.fn>>;
};

const osd = vi.hoisted(() => {
  const viewers: ViewerMock[] = [];
  const overlays: HTMLElement[] = [];
  function makeViewer(): ViewerMock {
    let destroyed = false;
    const instance = {
      addHandler: vi.fn((name: string, handler: () => void) => {
        if (name === "open") queueMicrotask(handler);
      }),
      removeHandler: vi.fn(),
      destroy: vi.fn(() => { destroyed = true; }),
      forceRedraw: vi.fn(),
      setMouseNavEnabled: vi.fn(() => {
        if (destroyed) throw new TypeError("Cannot read properties of undefined (reading 'tracking')");
      }),
      addOverlay: vi.fn((options: { element: HTMLElement }) => {
        overlays.push(options.element);
      }),
      removeOverlay: vi.fn(),
      world: { removeItem: vi.fn() },
      isDestroyed: () => destroyed,
      viewport: {
        getCenter: vi.fn(() => ({ x: 0.5, y: 0.25 })),
        getZoom: vi.fn(() => 1),
        goHome: vi.fn(),
        panTo: vi.fn(),
        zoomTo: vi.fn(),
        zoomBy: vi.fn(),
        applyConstraints: vi.fn(),
        pointFromPixel: vi.fn((point: unknown) => point),
        viewportToImageCoordinates: vi.fn((point: unknown) => point),
        imageToViewerElementCoordinates: vi.fn((point: unknown) => point),
        imageToViewportRectangle: vi.fn(() => ({ x: 0, y: 0, width: 1, height: 1 })),
      },
    };
    viewers.push(instance);
    return instance;
  }
  const factory = vi.fn(makeViewer) as unknown as ReturnType<typeof vi.fn> & { Point: new (x: number, y: number) => { x: number; y: number } };
  factory.Point = class Point { constructor(public x: number, public y: number) {} };
  return { factory, overlays, viewers };
});

vi.mock("openseadragon", () => ({ default: osd.factory }));

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function jpegResponse(content = "heatmap", status = 200) {
  return new Response(content, { status, headers: { "Content-Type": "image/jpeg" } });
}

beforeEach(() => {
  osd.factory.mockClear();
  osd.overlays.length = 0;
  osd.viewers.length = 0;
  clearWsiViewportCacheForTests();
  sessionStorage.setItem("accessToken", "test-token");
});

describe("CaseWsiEvidence", () => {
  it.each([
    ["HE" as const, "slide-he", "asset-he", [[2048, 1024], [1024, 512]]],
    ["PDL1" as const, "slide-pdl1", "asset-pdl1", [[4608, 2304], [1024, 512], [384, 192]]],
  ])("opens %s at home and keeps the viewer usable when annotation GET fails", async (stain, slideId, assetId, sizes) => {
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/specimens/")) return response([{ id: "specimen-1", specimen_code: "SP-1" }]);
      if (url.includes("/specimens/specimen-1/slides/")) return response([{
        id: slideId,
        specimen_id: "specimen-1",
        image_asset_id: assetId,
        slide_code: slideId,
        stain,
        status: "READY",
        viewer_url: `/api/doctor/cases/slides/${slideId}/viewer/`,
      }]);
      if (url.endsWith(`/slides/${slideId}/viewer/`)) return response({
        width: sizes[0][0],
        height: sizes[0][1],
        tile_width: 512,
        tile_height: 512,
        max_level: sizes.length - 1,
        sizes,
        tile_url_template: `/api/doctor/cases/slides/${slideId}/tiles/{level}/{x}/{y}.jpg`,
      });
      if (url.endsWith(`/slides/${slideId}/tissue-heatmap/`)) return response({ detail: "not available" }, 404);
      if (url.includes("/image-annotations/")) return response({ detail: "temporary annotation failure" }, 503);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-1" stain={stain} fillHeight />);

    expect(await screen.findByLabelText(`${slideId} WSI 뷰어`)).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("WSI는 계속 사용할 수 있습니다.");
    await waitFor(() => expect(osd.viewers[0]?.viewport.goHome).toHaveBeenCalledWith(true));
    expect(screen.getByRole("button", { name: "Point" })).toBeEnabled();
    const annotationUrl = String(authorizedFetch.mock.calls.find(([url]) => String(url).includes("/image-annotations/"))?.[0]);
    expect(annotationUrl).toContain(`image_asset_id=${assetId}`);
    expect(annotationUrl).toContain(`slide_id=${slideId}`);

    const tileSource = osd.factory.mock.calls[0][0].tileSources;
    expect(tileSource.getNumTiles(0)).toEqual({
      x: Math.ceil(sizes.at(-1)![0] / 512),
      y: Math.ceil(sizes.at(-1)![1] / 512),
    });
    expect(tileSource.getTileUrl(0, 0, 0)).toContain(`/tiles/${sizes.length - 1}/0/0.jpg`);
  });

  it("keeps viewer ownership safe across H&E, PD-L1, and case transitions", async () => {
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const caseId = url.match(/\/cases\/(case-[ab])\//)?.[1]
        ?? url.match(/\/specimens\/specimen-(case-[ab])\/slides\//)?.[1]
        ?? "case-a";
      if (url.endsWith("/specimens/")) {
        return response([{ id: `specimen-${caseId}`, specimen_code: `SP-${caseId}` }]);
      }
      if (url.includes(`/specimens/specimen-${caseId}/slides/`)) {
        return response((["HE", "PDL1"] as const).map((stain) => ({
          id: `${caseId}-${stain.toLowerCase()}`,
          specimen_id: `specimen-${caseId}`,
          image_asset_id: `asset-${caseId}-${stain.toLowerCase()}`,
          slide_code: `${caseId}-${stain.toLowerCase()}`,
          stain,
          status: "READY",
          viewer_url: `/api/doctor/cases/slides/${caseId}-${stain.toLowerCase()}/viewer/`,
        })));
      }
      if (url.includes("/viewer/")) {
        return response({
          width: 2048,
          height: 1024,
          tile_width: 512,
          tile_height: 512,
          max_level: 1,
          sizes: [[2048, 1024], [1024, 512]],
          tile_url_template: `${url.replace("/viewer/", "/tiles/{level}/{x}/{y}.jpg")}`,
        });
      }
      if (url.includes("/tissue-heatmap/")) return response({ detail: "not available" }, 404);
      if (url.includes("/image-annotations/")) return response([]);
      throw new Error(`Unexpected request: ${url}`);
    });

    const { rerender } = render(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-a" stain="HE" fillHeight />);
    await waitFor(() => expect(osd.viewers).toHaveLength(1));
    await waitFor(() => expect(osd.viewers[0].viewport.goHome).toHaveBeenCalledWith(true));

    rerender(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-a" stain="PDL1" fillHeight />);
    await waitFor(() => expect(osd.viewers).toHaveLength(2));
    expect(osd.viewers[0].destroy).toHaveBeenCalledOnce();
    expect(osd.viewers[0].isDestroyed()).toBe(true);
    await waitFor(() => expect(osd.viewers[1].viewport.goHome).toHaveBeenCalledWith(true));

    rerender(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-a" stain="HE" fillHeight />);
    await waitFor(() => expect(osd.viewers).toHaveLength(3));
    expect(osd.viewers[1].destroy).toHaveBeenCalledOnce();
    expect(osd.viewers[1].isDestroyed()).toBe(true);
    await waitFor(() => expect(osd.viewers[2].viewport.panTo).toHaveBeenCalled());

    rerender(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-b" stain="HE" fillHeight />);
    await waitFor(() => expect(osd.viewers).toHaveLength(4));
    expect(osd.viewers[2].destroy).toHaveBeenCalledOnce();
    expect(osd.viewers[2].isDestroyed()).toBe(true);
    await waitFor(() => expect(osd.viewers[3].viewport.goHome).toHaveBeenCalledWith(true));
  });

  it("adds a real heatmap as an OSD image layer without taking annotation interactions", async () => {
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/specimens/")) return response([{ id: "specimen-1", specimen_code: "SP-1" }]);
      if (url.includes("/specimens/specimen-1/slides/")) return response([{
        id: "slide-he", specimen_id: "specimen-1", image_asset_id: "asset-he", slide_code: "HE-1", stain: "HE", status: "READY", viewer_url: "/api/doctor/cases/slides/slide-he/viewer/",
      }]);
      if (url.endsWith("/slides/slide-he/viewer/")) return response({ width: 2048, height: 1024, tile_width: 512, tile_height: 512, max_level: 1, sizes: [[2048, 1024], [1024, 512]], tile_url_template: "/api/doctor/cases/slides/slide-he/tiles/{level}/{x}/{y}.jpg" });
      if (url.endsWith("/slides/slide-he/tissue-heatmap/")) return jpegResponse();
      if (url.includes("/image-annotations/")) return response([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:heatmap");

    render(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-1" stain="HE" fillHeight />);

    const toggle = await screen.findByRole("button", { name: "Heatmap" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(osd.viewers[0].addOverlay).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Point" })).toBeEnabled();
    toggle.click();
    expect(await screen.findByLabelText("Heatmap 투명도")).toHaveValue("65");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveClass("border-violet-600", "bg-violet-600", "text-white");
    await waitFor(() => expect(osd.overlays[0]?.style.opacity).toBe("0.65"));
    expect(osd.viewers[0].forceRedraw).toHaveBeenCalled();
    expect(createObjectUrl).toHaveBeenCalled();
  });

  it("uses the preview and keeps the heatmap available when the Orthanc series is not linked", async () => {
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/specimens/")) return response([{ id: "specimen-1", specimen_code: "SP-1" }]);
      if (url.includes("/specimens/specimen-1/slides/")) return response([{
        id: "slide-unlinked", specimen_id: "specimen-1", image_asset_id: "asset-1", slide_code: "HE-UNLINKED", stain: "HE", status: "READY", viewer_url: "/api/doctor/cases/slides/slide-unlinked/viewer/",
      }]);
      if (url.endsWith("/viewer/")) return response({ detail: "not linked", code: "ORTHANC_SERIES_NOT_LINKED" }, 202);
      if (url.endsWith("/preview/")) return jpegResponse("preview");
      if (url.endsWith("/tissue-heatmap/")) return jpegResponse("heatmap");
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image");

    render(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-1" stain="HE" fillHeight />);

    expect(await screen.findByRole("img", { name: "HE-UNLINKED 미리보기" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("WSI 원본 뷰어 연결이 준비되지 않았습니다. 미리보기 이미지를 표시합니다.");
    expect(osd.factory).not.toHaveBeenCalled();

    const toggle = screen.getByRole("button", { name: "Heatmap" });
    expect(toggle).toBeEnabled();
    toggle.click();
    expect(await screen.findByRole("img", { name: "WSI Heatmap" })).toBeInTheDocument();
  });

  it("distinguishes a viewer API error while still using the preview", async () => {
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/specimens/")) return response([{ id: "specimen-1", specimen_code: "SP-1" }]);
      if (url.includes("/specimens/specimen-1/slides/")) return response([{
        id: "slide-error", specimen_id: "specimen-1", image_asset_id: "asset-1", slide_code: "HE-ERROR", stain: "HE", status: "READY", viewer_url: "/api/doctor/cases/slides/slide-error/viewer/",
      }]);
      if (url.endsWith("/viewer/")) return response({ detail: "upstream unavailable" }, 502);
      if (url.endsWith("/preview/")) return jpegResponse("preview");
      if (url.endsWith("/tissue-heatmap/")) return response({ detail: "not available" }, 404);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");

    render(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-1" stain="HE" fillHeight />);

    expect(await screen.findByRole("img", { name: "HE-ERROR 미리보기" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("WSI 원본 뷰어를 불러오지 못했습니다. 미리보기 이미지를 표시합니다.");
  });

  it("shows an empty state when neither the viewer nor preview is available", async () => {
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/specimens/")) return response([{ id: "specimen-1", specimen_code: "SP-1" }]);
      if (url.includes("/specimens/specimen-1/slides/")) return response([{
        id: "slide-empty", specimen_id: "specimen-1", image_asset_id: "asset-1", slide_code: "HE-EMPTY", stain: "HE", status: "READY", viewer_url: "/api/doctor/cases/slides/slide-empty/viewer/",
      }]);
      if (url.endsWith("/viewer/")) return response({ detail: "not linked", code: "ORTHANC_SERIES_NOT_LINKED" }, 409);
      if (url.endsWith("/preview/")) return response({ detail: "not available" }, 404);
      if (url.endsWith("/tissue-heatmap/")) return response({ detail: "not available" }, 404);
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-1" stain="HE" fillHeight />);

    expect(await screen.findByText("표시할 WSI 이미지가 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("원본 WSI 뷰어 연결이 준비되지 않았습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a stale heatmap response after the Case viewer changes", async () => {
    let resolveHeatmap!: (value: Response) => void;
    const delayedHeatmap = new Promise<Response>((resolve) => { resolveHeatmap = resolve; });
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const caseId = url.includes("case-b") ? "case-b" : "case-a";
      if (url.endsWith("/specimens/")) return response([{ id: `specimen-${caseId}`, specimen_code: "SP-1" }]);
      if (url.includes(`/specimens/specimen-${caseId}/slides/`)) return response([{ id: `slide-${caseId}`, specimen_id: `specimen-${caseId}`, image_asset_id: `asset-${caseId}`, slide_code: `slide-${caseId}`, stain: "HE", status: "READY", viewer_url: `/api/doctor/cases/slides/slide-${caseId}/viewer/` }]);
      if (url.endsWith("/tissue-heatmap/")) return delayedHeatmap;
      if (url.endsWith("/viewer/")) return response({ width: 2048, height: 1024, tile_width: 512, tile_height: 512, max_level: 1, sizes: [[2048, 1024], [1024, 512]], tile_url_template: "/tiles/{level}/{x}/{y}.jpg" });
      if (url.includes("/image-annotations/")) return response([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    const { rerender } = render(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-a" stain="HE" fillHeight />);
    await waitFor(() => expect(osd.viewers).toHaveLength(1));
    rerender(<CaseWsiEvidence apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} caseId="case-b" stain="HE" fillHeight />);
    await waitFor(() => expect(osd.viewers).toHaveLength(2));
    resolveHeatmap(jpegResponse());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(osd.viewers[0].addOverlay).not.toHaveBeenCalled();
  });
});
