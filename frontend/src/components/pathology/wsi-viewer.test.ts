import type OpenSeadragonType from "openseadragon";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  attachWsiViewerLifecycle,
  clearWsiViewportCacheForTests,
  createWsiTileSource,
  wsiViewportCacheKey,
} from "./wsi-viewer";

function viewer(center = { x: 0.5, y: 0.25 }, zoom = 2) {
  const handlers = new Map<string, () => void>();
  return {
    handlers,
    addHandler: vi.fn((name: string, handler: () => void) => handlers.set(name, handler)),
    removeHandler: vi.fn(),
    forceRedraw: vi.fn(),
    viewport: {
      getCenter: vi.fn(() => center),
      getZoom: vi.fn(() => zoom),
      goHome: vi.fn(),
      panTo: vi.fn(),
      zoomTo: vi.fn(),
      applyConstraints: vi.fn(),
      resize: vi.fn(),
    },
  };
}

class ResizeObserverMock {
  static latest: ResizeObserverMock | null = null;
  constructor(readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.latest = this;
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

beforeEach(() => {
  clearWsiViewportCacheForTests();
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("WSI tile source", () => {
  it.each([
    ["H&E", [[2048, 1024], [1024, 512]] as Array<[number, number]>],
    ["PD-L1", [[4608, 2304], [1024, 512], [384, 192]] as Array<[number, number]>],
  ])("uses the real %s Orthanc level sizes instead of assuming a power-of-two pyramid", (_name, sizes) => {
    const source = createWsiTileSource({
      width: sizes[0][0],
      height: sizes[0][1],
      tile_width: 512,
      tile_height: 512,
      sizes,
      tile_url_template: "/tiles/{level}/{x}/{y}.jpg",
    });

    expect(source.maxLevel).toBe(sizes.length - 1);
    expect(source.getNumTiles(0)).toEqual({
      x: Math.ceil(sizes.at(-1)![0] / 512),
      y: Math.ceil(sizes.at(-1)![1] / 512),
    });
    expect(source.getNumTiles(sizes.length - 1)).toEqual({
      x: Math.ceil(sizes[0][0] / 512),
      y: Math.ceil(sizes[0][1] / 512),
    });
    expect(source.getTileUrl!(0, 0, 0)).toContain(`/tiles/${sizes.length - 1}/0/0.jpg`);
    expect(source.getTileUrl!(sizes.length - 1, 1, 2)).toContain("/tiles/0/1/2.jpg");
  });
});

describe("WSI viewport lifecycle", () => {
  const point = (x: number, y: number) => ({ x, y }) as OpenSeadragonType.Point;

  it("homes a new H&E or PD-L1 slide and restores only the same case/asset/slide", () => {
    const heKey = wsiViewportCacheKey("case-1", "asset-he", "slide-he");
    const pdl1Key = wsiViewportCacheKey("case-1", "asset-pdl1", "slide-pdl1");
    const he = viewer({ x: 0.4, y: 0.3 }, 3);
    const detachHe = attachWsiViewerLifecycle(he as unknown as OpenSeadragonType.Viewer, document.createElement("div"), heKey, point);
    he.handlers.get("open")?.();
    expect(he.viewport.goHome).toHaveBeenCalledWith(true);
    detachHe();

    const pdl1 = viewer();
    attachWsiViewerLifecycle(pdl1 as unknown as OpenSeadragonType.Viewer, document.createElement("div"), pdl1Key, point);
    pdl1.handlers.get("open")?.();
    expect(pdl1.viewport.goHome).toHaveBeenCalledWith(true);
    expect(pdl1.viewport.panTo).not.toHaveBeenCalled();

    const restoredHe = viewer();
    attachWsiViewerLifecycle(restoredHe as unknown as OpenSeadragonType.Viewer, document.createElement("div"), heKey, point);
    restoredHe.handlers.get("open")?.();
    expect(restoredHe.viewport.goHome).not.toHaveBeenCalled();
    expect(restoredHe.viewport.panTo).toHaveBeenCalledWith({ x: 0.4, y: 0.3 }, true);
    expect(restoredHe.viewport.zoomTo).toHaveBeenCalledWith(3, undefined, true);
  });

  it("resizes while preserving zoom/pan instead of returning home", () => {
    const current = viewer();
    attachWsiViewerLifecycle(current as unknown as OpenSeadragonType.Viewer, document.createElement("div"), "case:asset:slide", point);
    current.handlers.get("open")?.();
    ResizeObserverMock.latest?.callback([
      { contentRect: { width: 900, height: 600 } } as ResizeObserverEntry,
    ], ResizeObserverMock.latest as unknown as ResizeObserver);

    expect(current.viewport.resize).toHaveBeenCalledWith({ x: 900, y: 600 }, true);
    expect(current.forceRedraw).toHaveBeenCalled();
    expect(current.viewport.goHome).toHaveBeenCalledTimes(1);
  });
});
