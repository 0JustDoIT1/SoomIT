import type OpenSeadragonType from "openseadragon";

export type WsiPyramidMetadata = {
  width: number;
  height: number;
  tile_width: number;
  tile_height: number;
  max_level?: number;
  sizes?: Array<[number, number]>;
  tile_url_template: string;
};

type WsiTileSource = OpenSeadragonType.TileSourceOptions & {
  getLevelScale: (level: number) => number;
  getNumTiles: (level: number) => { x: number; y: number };
};

type CachedViewport = {
  center: { x: number; y: number };
  zoom: number;
};

const viewportCache = new Map<string, CachedViewport>();

export function wsiViewportCacheKey(caseId: string, imageAssetId: string, slideId: string) {
  return `${caseId.trim()}:${imageAssetId.trim()}:${slideId.trim()}`;
}

function normalizedLevelSizes(metadata: WsiPyramidMetadata) {
  const sizes = metadata.sizes?.filter(
    (size): size is [number, number] =>
      Array.isArray(size) && size.length === 2 && size[0] > 0 && size[1] > 0,
  );
  if (sizes?.length) return [...sizes].reverse();

  const maxLevel = Math.max(metadata.max_level ?? 0, 0);
  return Array.from({ length: maxLevel + 1 }, (_, level) => {
    const scale = 1 / 2 ** (maxLevel - level);
    return [Math.ceil(metadata.width * scale), Math.ceil(metadata.height * scale)] as [number, number];
  });
}

export function createWsiTileSource(metadata: WsiPyramidMetadata): WsiTileSource {
  const levelSizes = normalizedLevelSizes(metadata);
  const maxLevel = levelSizes.length - 1;
  return {
    width: metadata.width,
    height: metadata.height,
    tileWidth: metadata.tile_width,
    tileHeight: metadata.tile_height,
    minLevel: 0,
    maxLevel,
    getLevelScale(level: number) {
      const size = levelSizes[level] ?? levelSizes[0];
      return size[0] / metadata.width;
    },
    getNumTiles(level: number) {
      const size = levelSizes[level] ?? levelSizes[0];
      return {
        x: Math.ceil(size[0] / metadata.tile_width),
        y: Math.ceil(size[1] / metadata.tile_height),
      };
    },
    getTileUrl(level: number, x: number, y: number) {
      const orthancLevel = maxLevel - level;
      return metadata.tile_url_template
        .replace("{level}", String(orthancLevel))
        .replace("{x}", String(x))
        .replace("{y}", String(y));
    },
  };
}

export function attachWsiViewerLifecycle(
  viewer: OpenSeadragonType.Viewer,
  container: HTMLElement,
  cacheKey: string,
  makePoint: (x: number, y: number) => OpenSeadragonType.Point,
) {
  let initialized = false;
  const restoreOrFit = () => {
    if (initialized) return;
    initialized = true;
    const cached = viewportCache.get(cacheKey);
    if (cached) {
      viewer.viewport.panTo(makePoint(cached.center.x, cached.center.y), true);
      viewer.viewport.zoomTo(cached.zoom, undefined, true);
      viewer.viewport.applyConstraints(true);
    } else {
      viewer.viewport.goHome(true);
    }
  };
  const save = () => {
    if (!initialized) return;
    const center = viewer.viewport.getCenter(true);
    viewportCache.set(cacheKey, {
      center: { x: center.x, y: center.y },
      zoom: viewer.viewport.getZoom(true),
    });
  };

  viewer.addHandler("open", restoreOrFit);
  viewer.addHandler("animation-finish", save);

  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
    const size = entries[0]?.contentRect;
    if (!size || size.width <= 0 || size.height <= 0) return;
    const resize = viewer.viewport.resize as unknown as (
      newContainerSize: OpenSeadragonType.Point,
      maintain: boolean,
    ) => OpenSeadragonType.Viewport;
    resize.call(viewer.viewport, makePoint(size.width, size.height), true);
    viewer.forceRedraw();
  });
  observer?.observe(container);

  return () => {
    save();
    observer?.disconnect();
    viewer.removeHandler("open", restoreOrFit);
    viewer.removeHandler("animation-finish", save);
  };
}

export function clearWsiViewportCacheForTests() {
  viewportCache.clear();
}
