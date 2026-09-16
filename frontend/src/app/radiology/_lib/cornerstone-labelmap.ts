import {
  fetchRadiologyCornerstoneLabelmap,
  fetchRadiologyCornerstoneSegmentationMetadata,
  type RadiologyCornerstoneSegmentationMetadata,
} from "./radiology-api";

export type CtCornerstoneSegmentation = {
  metadata: RadiologyCornerstoneSegmentationMetadata;
  voxels: Uint8Array | Uint16Array;
};

/**
 * Loads the Cornerstone3D labelmap for one CT analysis as raw voxel data plus
 * its geometry/segment manifest.
 *
 * This is intentionally rendered as a hand-drawn 2D canvas overlay
 * (cornerstone-labelmap-overlay.ts) rather than through Cornerstone's own
 * segmentation representation system: every one of Cornerstone's three
 * built-in labelmap rendering strategies (a separate volume actor, a merged
 * independent-components actor, and a 2D slice image mapper actor) reported
 * fully correct internal state in this app - visible actor, populated
 * transfer function, matching bounds, correct blend mode - yet none of them
 * ever produced a single visible pixel, confirmed by directly reading back
 * the onscreen canvas pixels. Matching the library's documented usage exactly
 * didn't change that either, so the overlay here bypasses that system
 * entirely instead of depending on it.
 */
export async function loadCtCornerstoneSegmentation(analysisId: string): Promise<CtCornerstoneSegmentation> {
  const [metadata, labelmapBytes] = await Promise.all([
    fetchRadiologyCornerstoneSegmentationMetadata(analysisId),
    fetchRadiologyCornerstoneLabelmap(analysisId),
  ]);

  const ScalarArray = metadata.scalar_type === "uint16" ? Uint16Array : Uint8Array;
  const voxels = new ScalarArray(labelmapBytes);
  const [nx, ny, nz] = metadata.dimensions;
  if (voxels.length !== nx * ny * nz) {
    throw new Error(
      `CT labelmap 크기가 예상과 다릅니다. (voxels=${voxels.length}, expected=${nx * ny * nz})`,
    );
  }

  return { metadata, voxels };
}
