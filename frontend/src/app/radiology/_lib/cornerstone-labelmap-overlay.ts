import type * as CornerstoneCore from "@cornerstonejs/core";
import type { RenderingEngine, Types } from "@cornerstonejs/core";

import type { CtCornerstoneSegmentation } from "./cornerstone-labelmap";

type Orientation = "axial" | "coronal" | "sagittal";

type OrientationViewport = {
  getCamera: () => { focalPoint: Types.Point3 };
  worldToCanvas: (world: Types.Point3) => Types.Point2;
  element: HTMLElement;
};

// The backend generates this labelmap on the exact same voxel grid as the CT
// volume with an identity direction matrix (verified against geometry.json:
// direction = [1,0,0, 0,1,0, 0,0,1]), so a volume axis (i/j/k) maps directly
// to one world axis (x/y/z) with no rotation - axial/coronal/sagittal each
// slice along a fixed axis of the raw voxel array.
const AXIS_FOR_ORIENTATION: Record<Orientation, 0 | 1 | 2> = {
  sagittal: 0,
  coronal: 1,
  axial: 2,
};

function buildSliceColorLut(metadata: CtCornerstoneSegmentation["metadata"]) {
  const maxIndex = metadata.segments.reduce((max, segment) => Math.max(max, segment.segment_index), 0);
  const lut = new Uint8ClampedArray((maxIndex + 1) * 4);
  for (const segment of metadata.segments) {
    // Only the nodule is shown by default - lung lobes/anatomy are part of
    // the manifest but shouldn't color the overlay unless explicitly toggled
    // on later.
    if (segment.category !== "NODULE") continue;
    if (segment.default_visible === false) continue;
    const alpha = Math.round(255 * (segment.default_opacity ?? 0.5));
    const offset = segment.segment_index * 4;
    lut[offset] = segment.color[0];
    lut[offset + 1] = segment.color[1];
    lut[offset + 2] = segment.color[2];
    lut[offset + 3] = alpha;
  }
  return lut;
}

/**
 * Extracts one 2D slice of the labelmap volume along `axis` at `sliceIndex`
 * and rasterizes it to an offscreen canvas using per-segment color/opacity.
 * The raw voxel array is laid out slice-major: idx = k*ny*nx + j*nx + i
 * (backend's documented voxel_order: "slice_row_column").
 */
function rasterizeSlice(
  segmentation: CtCornerstoneSegmentation,
  colorLut: Uint8ClampedArray,
  axis: 0 | 1 | 2,
  sliceIndex: number,
): HTMLCanvasElement {
  const { voxels, metadata } = segmentation;
  const [nx, ny, nz] = metadata.dimensions;
  const width = axis === 0 ? ny : nx;
  const height = axis === 2 ? ny : nz;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const imageData = ctx.createImageData(width, height);
  const { data } = imageData;
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      let i: number, j: number, k: number;
      if (axis === 2) {
        i = col; j = row; k = sliceIndex;
      } else if (axis === 1) {
        i = col; j = sliceIndex; k = row;
      } else {
        i = sliceIndex; j = col; k = row;
      }
      const value = voxels[k * ny * nx + j * nx + i];
      if (value === 0) continue;
      const lutOffset = value * 4;
      const alpha = colorLut[lutOffset + 3];
      if (!alpha) continue;
      const pixelOffset = (row * width + col) * 4;
      data[pixelOffset] = colorLut[lutOffset];
      data[pixelOffset + 1] = colorLut[lutOffset + 1];
      data[pixelOffset + 2] = colorLut[lutOffset + 2];
      data[pixelOffset + 3] = alpha;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function worldFromIJK(metadata: CtCornerstoneSegmentation["metadata"], ijk: [number, number, number]): Types.Point3 {
  const { origin, spacing, direction } = metadata;
  const world: [number, number, number] = [0, 0, 0];
  for (let r = 0; r < 3; r += 1) {
    world[r] =
      origin[r] +
      direction[r * 3] * spacing[0] * ijk[0] +
      direction[r * 3 + 1] * spacing[1] * ijk[1] +
      direction[r * 3 + 2] * spacing[2] * ijk[2];
  }
  return world;
}

/**
 * Draws one MPR viewport's labelmap overlay onto `canvas`, keeping it in sync
 * with that viewport's camera (pan/zoom/scroll) and its container's size.
 * Returns a cleanup function.
 */
export function attachCtCornerstoneLabelmapOverlay(
  core: typeof CornerstoneCore,
  viewportId: string,
  orientation: Orientation,
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  renderingEngine: RenderingEngine,
  segmentation: CtCornerstoneSegmentation,
): () => void {
  const axis = AXIS_FOR_ORIENTATION[orientation];
  const colorLut = buildSliceColorLut(segmentation.metadata);
  const [nx, ny, nz] = segmentation.metadata.dimensions;
  const axisDimension = [nx, ny, nz][axis];

  let cachedSliceIndex = -1;
  let cachedSliceCanvas: HTMLCanvasElement | null = null;
  let disposed = false;
  // Don't paint the overlay until the CT itself has rendered at least one
  // real frame - otherwise the nodule outline can flash into view before the
  // CT image underneath it has loaded, which looks broken even though it
  // isn't. Also coalesces bursts of CAMERA_MODIFIED (e.g. a drag) onto a
  // single animation frame instead of re-rasterizing synchronously on every
  // event, so it doesn't compete with the CT volume's own loading work.
  let ctReady = false;
  let rafHandle: number | null = null;

  const performDraw = () => {
    if (disposed || !ctReady) return;
    const viewport = renderingEngine.getViewport(viewportId) as unknown as OrientationViewport | undefined;
    const ctx = canvas.getContext("2d");
    if (!viewport || !ctx) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { focalPoint } = viewport.getCamera();
    const { origin, spacing } = segmentation.metadata;
    const sliceIndex = Math.round((focalPoint[axis] - origin[axis]) / spacing[axis]);
    if (sliceIndex < 0 || sliceIndex >= axisDimension) return;

    if (sliceIndex !== cachedSliceIndex) {
      cachedSliceCanvas = rasterizeSlice(segmentation, colorLut, axis, sliceIndex);
      cachedSliceIndex = sliceIndex;
    }
    if (!cachedSliceCanvas) return;

    // Map the slice's world-space corners through the viewport's own
    // worldToCanvas so pan/zoom/scroll are respected automatically, without
    // us having to reimplement Cornerstone's camera math.
    let originIJK: [number, number, number];
    let uIJK: [number, number, number];
    let vIJK: [number, number, number];
    if (axis === 2) {
      originIJK = [0, 0, sliceIndex]; uIJK = [nx, 0, sliceIndex]; vIJK = [0, ny, sliceIndex];
    } else if (axis === 1) {
      originIJK = [0, sliceIndex, 0]; uIJK = [nx, sliceIndex, 0]; vIJK = [0, sliceIndex, nz];
    } else {
      originIJK = [sliceIndex, 0, 0]; uIJK = [sliceIndex, ny, 0]; vIJK = [sliceIndex, 0, nz];
    }
    const originCanvas = viewport.worldToCanvas(worldFromIJK(segmentation.metadata, originIJK));
    const uCanvas = viewport.worldToCanvas(worldFromIJK(segmentation.metadata, uIJK));
    const vCanvas = viewport.worldToCanvas(worldFromIJK(segmentation.metadata, vIJK));

    const imgWidth = cachedSliceCanvas.width;
    const imgHeight = cachedSliceCanvas.height;
    const a = (uCanvas[0] - originCanvas[0]) / imgWidth;
    const b = (uCanvas[1] - originCanvas[1]) / imgWidth;
    const c = (vCanvas[0] - originCanvas[0]) / imgHeight;
    const d = (vCanvas[1] - originCanvas[1]) / imgHeight;
    ctx.setTransform(a, b, c, d, originCanvas[0], originCanvas[1]);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cachedSliceCanvas, 0, 0);
  };

  const scheduleRedraw = () => {
    if (disposed || rafHandle !== null) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      performDraw();
    });
  };

  const element = renderingEngine.getViewport(viewportId)?.element;
  element?.addEventListener(core.Enums.Events.CAMERA_MODIFIED, scheduleRedraw);
  const handleFirstImageRendered = () => {
    if (ctReady) return;
    ctReady = true;
    scheduleRedraw();
  };
  element?.addEventListener(core.Enums.Events.IMAGE_RENDERED, handleFirstImageRendered);
  // The CT's first real render may already have happened (and its
  // IMAGE_RENDERED event already fired) before this listener was attached -
  // request one more render now so we're guaranteed to observe one
  // ourselves, rather than waiting indefinitely on a stalled volume load.
  renderingEngine.render();
  const resizeObserver = new ResizeObserver(scheduleRedraw);
  resizeObserver.observe(container);

  return () => {
    disposed = true;
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    element?.removeEventListener(core.Enums.Events.IMAGE_RENDERED, handleFirstImageRendered);
    element?.removeEventListener(core.Enums.Events.CAMERA_MODIFIED, scheduleRedraw);
    resizeObserver.disconnect();
  };
}
