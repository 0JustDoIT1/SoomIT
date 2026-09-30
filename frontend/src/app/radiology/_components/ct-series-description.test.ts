import { describe, expect, it } from "vitest";
import { ctSeriesDescription } from "./ct-series-description";

describe("CT Series description display", () => {
  it("uses the existing SeriesDescription unchanged", () => {
    expect(ctSeriesDescription("Chest CT", 48, true)).toBe("Chest CT");
  });

  it("uses the actual series slice count when CT SeriesDescription is absent", () => {
    expect(ctSeriesDescription(null, 48, true)).toBe("CT Series · 48 slices");
    expect(ctSeriesDescription("", 12, true)).toBe("CT Series · 12 slices");
  });

  it("keeps the non-CT fallback unchanged", () => {
    expect(ctSeriesDescription(null, 48, false)).toBe("설명 없음");
  });
});
