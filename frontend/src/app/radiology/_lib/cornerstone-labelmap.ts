import { ensureCornerstoneInitialized } from "./cornerstone-init";
import {
  fetchRadiologyCornerstoneLabelmap,
  fetchRadiologyCornerstoneSegmentationMetadata,
  type RadiologyCornerstoneSegmentationMetadata,
} from "./radiology-api";

export type CtCornerstoneSegmentation = {
  segmentationId: string;
  metadata: RadiologyCornerstoneSegmentationMetadata;
};

/**
 * Loads the Cornerstone3D labelmap for one CT analysis and registers it as a
 * segmentation derived from the already-loaded CT volume, so it inherits that
 * volume's dimensions/spacing/origin/direction instead of trusting a second,
 * independently-computed geometry for alignment.
 */
export async function loadCtCornerstoneSegmentation(
  analysisId: string,
  referencedVolumeId: string,
): Promise<CtCornerstoneSegmentation> {
  const { core, tools } = await ensureCornerstoneInitialized();
  const [metadata, labelmapBytes] = await Promise.all([
    fetchRadiologyCornerstoneSegmentationMetadata(analysisId),
    fetchRadiologyCornerstoneLabelmap(analysisId),
  ]);

  const segmentationId = `ct-cornerstone-${analysisId}`;
  const ScalarArray = metadata.scalar_type === "uint16" ? Uint16Array : Uint8Array;
  const voxels = new ScalarArray(labelmapBytes);

  const derivedVolume = core.volumeLoader.createAndCacheDerivedLabelmapVolume(referencedVolumeId, {
    volumeId: segmentationId,
    targetBuffer: { type: metadata.scalar_type === "uint16" ? "Uint16Array" : "Uint8Array" },
  });
  const voxelManager = derivedVolume.voxelManager;
  if (!voxelManager) {
    throw new Error("Cornerstone labelmap voxel manager를 생성하지 못했습니다.");
  }
  if (voxelManager.getScalarDataLength() !== voxels.length) {
    throw new Error("CT labelmap 크기가 CT 볼륨과 일치하지 않습니다.");
  }
  voxelManager.setScalarData(voxels);

  tools.segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: tools.Enums.SegmentationRepresentations.Labelmap,
        data: { volumeId: segmentationId },
      },
    },
  ]);

  return { segmentationId, metadata };
}

/**
 * Adds a loaded segmentation to one viewport and applies each segment's default
 * color/opacity/visibility from the manifest. Call once per viewport that should
 * show the overlay (a viewport-scoped call, unlike loadCtCornerstoneSegmentation).
 */
export async function applyCtCornerstoneSegmentationToViewport(
  viewportId: string,
  segmentation: CtCornerstoneSegmentation,
) {
  const { tools } = await ensureCornerstoneInitialized();
  const { segmentationId, metadata } = segmentation;

  tools.segmentation.addLabelmapRepresentationToViewport(viewportId, [{ segmentationId }]);

  for (const segment of metadata.segments) {
    tools.segmentation.config.color.setSegmentIndexColor(viewportId, segmentationId, segment.segment_index, [
      ...segment.color,
      255,
    ]);
    tools.segmentation.segmentationStyle.setStyle(
      {
        type: tools.Enums.SegmentationRepresentations.Labelmap,
        viewportId,
        segmentationId,
        segmentIndex: segment.segment_index,
      },
      {
        fillAlpha: segment.default_opacity ?? 0.5,
        renderFill: true,
        renderOutline: segment.category === "NODULE",
        outlineWidth: segment.category === "NODULE" ? 2 : 1,
      },
    );
    if (segment.default_visible === false) {
      tools.segmentation.config.visibility.setSegmentIndexVisibility(
        viewportId,
        { segmentationId },
        segment.segment_index,
        false,
      );
    }
  }
}
