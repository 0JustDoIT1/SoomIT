export function ctSeriesDescription(description: string | null, sliceCount: number, isCt: boolean) {
  return description || (isCt ? `CT Series · ${sliceCount} slices` : "설명 없음");
}
