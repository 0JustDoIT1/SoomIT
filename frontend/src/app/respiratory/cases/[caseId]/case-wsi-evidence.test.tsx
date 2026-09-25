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
  addTiledImage: ReturnType<typeof vi.fn>;
  world: { removeItem: ReturnType<typeof vi.fn> };
  isDestroyed: () => boolean;
  viewport: Record<string, ReturnType<typeof vi.fn>>;
};

const osd = vi.hoisted(() => {
  const viewers: ViewerMock[] = [];
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
      addTiledImage: vi.fn((options: { success?: (event: { item: { setOpacity: ReturnType<typeof vi.fn> } }) => void }) => {
        options.success?.({ item: { setOpacity: vi.fn() } });
      }),
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
      },
    };
    viewers.push(instance);
    return instance;
  }
  const factory = vi.fn(makeViewer) as unknown as ReturnType<typeof vi.fn> & { Point: new (x: number, y: number) => { x: number; y: number } };
  factory.Point = class Point { constructor(public x: number, public y: number) {} };
  return { factory, viewers };
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
    await waitFor(() => expect(osd.viewers[0].addTiledImage).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Point" })).toBeEnabled();
    toggle.click();
    expect(await screen.findByLabelText("Heatmap 투명도")).toHaveValue("45");
    expect(createObjectUrl).toHaveBeenCalled();
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
    expect(osd.viewers[0].addTiledImage).not.toHaveBeenCalled();
  });
});
