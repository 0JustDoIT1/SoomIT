import * as dicomParser from "dicom-parser";

export interface DicomHeaderInfo {
  file: File;
  modality: string | null;
  studyInstanceUid: string | null;
  seriesInstanceUid: string | null;
  seriesDescription: string | null;
  instanceNumber: number | null;
  imagePositionPatient: number[] | null;
  sopInstanceUid: string | null;
  rows: number | null;
  columns: number | null;
}

const TAG = {
  MODALITY: "x00080060",
  STUDY_INSTANCE_UID: "x0020000d",
  SERIES_INSTANCE_UID: "x0020000e",
  SERIES_DESCRIPTION: "x0008103e",
  INSTANCE_NUMBER: "x00200013",
  IMAGE_POSITION_PATIENT: "x00200032",
  SOP_INSTANCE_UID: "x00080018",
  ROWS: "x00280010",
  COLUMNS: "x00280011",
} as const;

function parseImagePositionPatient(value: string | undefined) {
  if (!value) return null;
  const parts = value.split("\\").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return parts;
}

/**
 * Reads a File's DICOM header tags in the browser. Returns null when the file
 * has no valid DICOM preamble (used to filter out non-DICOM files).
 */
export async function parseDicomHeader(file: File): Promise<DicomHeaderInfo | null> {
  let dataSet: dicomParser.DataSet;
  try {
    const buffer = await file.arrayBuffer();
    dataSet = dicomParser.parseDicom(new Uint8Array(buffer));
  } catch {
    return null;
  }

  const instanceNumberRaw = dataSet.intString(TAG.INSTANCE_NUMBER);
  const rowsRaw = dataSet.uint16(TAG.ROWS);
  const columnsRaw = dataSet.uint16(TAG.COLUMNS);

  return {
    file,
    modality: dataSet.string(TAG.MODALITY) ?? null,
    studyInstanceUid: dataSet.string(TAG.STUDY_INSTANCE_UID) ?? null,
    seriesInstanceUid: dataSet.string(TAG.SERIES_INSTANCE_UID) ?? null,
    seriesDescription: dataSet.string(TAG.SERIES_DESCRIPTION) ?? null,
    instanceNumber: instanceNumberRaw ?? null,
    imagePositionPatient: parseImagePositionPatient(dataSet.string(TAG.IMAGE_POSITION_PATIENT)),
    sopInstanceUid: dataSet.string(TAG.SOP_INSTANCE_UID) ?? null,
    rows: rowsRaw ?? null,
    columns: columnsRaw ?? null,
  };
}

export async function parseDicomHeaders(files: File[]): Promise<DicomHeaderInfo[]> {
  const results = await Promise.all(files.map(parseDicomHeader));
  return results.filter((header): header is DicomHeaderInfo => header !== null);
}

export function groupBySeriesInstanceUid(headers: DicomHeaderInfo[]): Map<string, DicomHeaderInfo[]> {
  const groups = new Map<string, DicomHeaderInfo[]>();
  for (const header of headers) {
    const key = header.seriesInstanceUid ?? "UNKNOWN_SERIES";
    const existing = groups.get(key);
    if (existing) {
      existing.push(header);
    } else {
      groups.set(key, [header]);
    }
  }
  return groups;
}

export interface SeriesSummary {
  seriesInstanceUid: string;
  seriesDescription: string | null;
  modality: string | null;
  sliceCount: number;
}

const LOCALIZER_KEYWORDS = ["localizer", "scout", "topogram"];

export function isLikelyLocalizer(summary: Pick<SeriesSummary, "seriesDescription">) {
  const description = summary.seriesDescription?.toLowerCase() ?? "";
  return LOCALIZER_KEYWORDS.some((keyword) => description.includes(keyword));
}

/**
 * Summarizes each Series group, sorted by slice count descending (largest Series first).
 */
export function summarizeSeries(groups: Map<string, DicomHeaderInfo[]>): SeriesSummary[] {
  return Array.from(groups.entries())
    .map(([seriesInstanceUid, headers]) => ({
      seriesInstanceUid,
      seriesDescription: headers[0]?.seriesDescription ?? null,
      modality: headers[0]?.modality ?? null,
      sliceCount: headers.length,
    }))
    .sort((a, b) => b.sliceCount - a.sliceCount);
}

/**
 * Default selection rule: prefer CT Series that aren't a localizer/scout, largest slice count first.
 * Returns null when no Series matches (caller falls back to no default / manual selection).
 */
export function pickDefaultSeriesUid(summaries: SeriesSummary[]): string | null {
  const candidate = summaries.find((summary) => summary.modality === "CT" && !isLikelyLocalizer(summary));
  return candidate?.seriesInstanceUid ?? null;
}

/**
 * Orders a Series' files for representative-slice selection: by ImagePositionPatient's
 * through-plane (z) coordinate when every file has one, else InstanceNumber, else filename.
 */
export function sortSeriesFiles(headers: DicomHeaderInfo[]): DicomHeaderInfo[] {
  if (headers.every((header) => header.imagePositionPatient !== null)) {
    return [...headers].sort((a, b) => a.imagePositionPatient![2] - b.imagePositionPatient![2]);
  }
  if (headers.every((header) => header.instanceNumber !== null)) {
    return [...headers].sort((a, b) => a.instanceNumber! - b.instanceNumber!);
  }
  return [...headers].sort((a, b) => a.file.name.localeCompare(b.file.name));
}

export const MINIMUM_CT_SERIES_SLICE_COUNT = 10;

/**
 * Client-side pre-check for a selected CT Series before AI analysis can be requested.
 * The backend repeats an equivalent validation as the final authority.
 */
export function validateCtSeries(headers: DicomHeaderInfo[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (headers.length === 0) {
    return { valid: false, errors: ["선택된 DICOM 파일이 없습니다."] };
  }

  if (!headers.every((header) => header.modality === "CT")) {
    errors.push("Modality가 CT가 아닌 파일이 포함되어 있습니다.");
  }

  const studyUids = new Set(headers.map((header) => header.studyInstanceUid));
  if (studyUids.size > 1 || studyUids.has(null)) {
    errors.push("StudyInstanceUID가 서로 다르거나 누락된 파일이 있습니다.");
  }

  const seriesUids = new Set(headers.map((header) => header.seriesInstanceUid));
  if (seriesUids.size > 1 || seriesUids.has(null)) {
    errors.push("SeriesInstanceUID가 서로 다르거나 누락된 파일이 있습니다.");
  }

  const sopUids = headers.map((header) => header.sopInstanceUid);
  const uniqueSopUids = new Set(sopUids);
  if (uniqueSopUids.size !== sopUids.length || uniqueSopUids.has(null)) {
    errors.push("SOPInstanceUID가 중복되거나 누락된 파일이 있습니다.");
  }

  if (headers.length < MINIMUM_CT_SERIES_SLICE_COUNT) {
    errors.push(`slice 수가 너무 적습니다. 최소 ${MINIMUM_CT_SERIES_SLICE_COUNT}장 이상 필요합니다. (현재 ${headers.length}장)`);
  }

  if (isLikelyLocalizer({ seriesDescription: headers[0]?.seriesDescription ?? null })) {
    errors.push("Localizer/Scout Series는 분석 대상으로 사용할 수 없습니다.");
  }

  return { valid: errors.length === 0, errors };
}

export function validatePetSeries(headers: DicomHeaderInfo[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (headers.length === 0) return { valid: false, errors: ["선택된 DICOM 파일이 없습니다."] };
  if (!headers.every((header) => header.modality === "PT")) errors.push("Modality가 PT가 아닌 파일이 포함되어 있습니다.");
  const studyUids = new Set(headers.map((header) => header.studyInstanceUid));
  if (studyUids.size !== 1 || studyUids.has(null)) errors.push("StudyInstanceUID가 서로 다르거나 누락된 파일이 있습니다.");
  const seriesUids = new Set(headers.map((header) => header.seriesInstanceUid));
  if (seriesUids.size !== 1 || seriesUids.has(null)) errors.push("SeriesInstanceUID가 서로 다르거나 누락된 파일이 있습니다.");
  const sopUids = headers.map((header) => header.sopInstanceUid);
  if (new Set(sopUids).size !== sopUids.length || new Set(sopUids).has(null)) errors.push("SOPInstanceUID가 중복되거나 누락된 파일이 있습니다.");
  return { valid: errors.length === 0, errors };
}
