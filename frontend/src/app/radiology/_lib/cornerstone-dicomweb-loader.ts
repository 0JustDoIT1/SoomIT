import { ensureCornerstoneInitialized } from "./cornerstone-init";
import { ctDicomWebFrameUrl, ctDicomWebMetadataUrl, fetchCtDicomWebJson } from "./radiology-api";

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
 * Registers one CT Series with Cornerstone's WADO-RS loader. Metadata is fetched
 * once up front so volume geometry is available before pixel loading starts;
 * frames themselves remain lazy and are scheduled by Cornerstone's request pool.
 */
export async function loadCtDicomWebSeries(orderId: string, assetId: string): Promise<CtDicomWebSeries> {
  const { dicomImageLoader } = await ensureCornerstoneInitialized();
  const instances = await fetchCtDicomWebJson<DicomJsonDataset[]>(ctDicomWebMetadataUrl(orderId, assetId));

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

  const metadataBySopUid = new Map(
    instances.map((dataset) => [tagString(dataset, TAG_SOP_INSTANCE_UID), dataset]),
  );
  const imageIds = ordered.map(({ sopInstanceUid }) => {
    const imageId = `wadors:${ctDicomWebFrameUrl(orderId, assetId, sopInstanceUid)}`;
    const metadata = metadataBySopUid.get(sopInstanceUid);
    if (!metadata) throw new Error(`DICOM metadata가 없습니다: ${sopInstanceUid}`);
    dicomImageLoader.wadors.metaDataManager.add(imageId, metadata);
    return imageId;
  });

  return { imageIds };
}
