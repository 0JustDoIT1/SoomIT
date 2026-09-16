import { ensureCornerstoneInitialized } from "./cornerstone-init";
import { ctDicomWebInstancesUrl, fetchCtDicomWebInstance, fetchCtDicomWebJson } from "./radiology-api";

type DicomJsonElement = { vr: string; Value?: unknown[] };
type DicomJsonDataset = Record<string, DicomJsonElement>;

const TAG_SOP_INSTANCE_UID = "00080018";
const TAG_INSTANCE_NUMBER = "00200013";
const TAG_IMAGE_POSITION_PATIENT = "00200032";

function tagString(dataset: DicomJsonDataset, tag: string): string | null {
  const value = dataset[tag]?.Value?.[0];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function tagNumbers(dataset: DicomJsonDataset, tag: string): number[] | null {
  const value = dataset[tag]?.Value;
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.every((item): item is number => typeof item === "number") ? value : null;
}

export type CtDicomWebSeries = {
  imageIds: string[];
};

/**
 * Loads one CT Series through the authenticated DICOMweb proxy and registers every
 * instance with Cornerstone's wadouri loader (the same fileManager.add pattern
 * CtSeriesPreview already uses for local uploads), returning imageIds ordered by
 * slice position for stack scrolling and volume/MPR construction.
 */
export async function loadCtDicomWebSeries(orderId: string, assetId: string): Promise<CtDicomWebSeries> {
  const { dicomImageLoader } = await ensureCornerstoneInitialized();
  const instances = await fetchCtDicomWebJson<DicomJsonDataset[]>(ctDicomWebInstancesUrl(orderId, assetId));

  const ordered = instances
    .map((dataset) => ({
      sopInstanceUid: tagString(dataset, TAG_SOP_INSTANCE_UID),
      instanceNumber: Number(tagString(dataset, TAG_INSTANCE_NUMBER) ?? "0"),
      position: tagNumbers(dataset, TAG_IMAGE_POSITION_PATIENT),
    }))
    .filter((item): item is { sopInstanceUid: string; instanceNumber: number; position: number[] | null } =>
      Boolean(item.sopInstanceUid),
    )
    .sort((a, b) => (a.position && b.position ? a.position[2] - b.position[2] : a.instanceNumber - b.instanceNumber));

  if (ordered.length === 0) {
    throw new Error("CT Series에 표시할 Instance가 없습니다.");
  }

  const imageIds = await Promise.all(
    ordered.map(async ({ sopInstanceUid }) => {
      const bytes = await fetchCtDicomWebInstance(orderId, assetId, sopInstanceUid);
      const file = new File([bytes], `${sopInstanceUid}.dcm`, { type: "application/dicom" });
      return dicomImageLoader.wadouri.fileManager.add(file);
    }),
  );

  return { imageIds };
}
