import { describe, expect, it } from "vitest";

import { ijkFromWorld, voxelAxisForOrientation } from "./cornerstone-labelmap-overlay";

const metadata = {
  schema_version: "test",
  scalar_type: "uint8" as const,
  dimensions: [10, 20, 30] as [number, number, number],
  spacing: [2, 3, 4] as [number, number, number],
  origin: [10, 20, 30] as [number, number, number],
  direction: [0, -1, 0, 1, 0, 0, 0, 0, 1],
  segments: [],
  labelmap_url: "",
};

describe("Cornerstone labelmap geometry", () => {
  it("maps world coordinates back through origin, spacing, and direction", () => {
    expect(ijkFromWorld(metadata, [-2, 24, 50])).toEqual([2, 4, 5]);
  });

  it("selects the voxel axis aligned to each patient orientation", () => {
    expect(voxelAxisForOrientation(metadata.direction, "sagittal")).toBe(1);
    expect(voxelAxisForOrientation(metadata.direction, "coronal")).toBe(0);
    expect(voxelAxisForOrientation(metadata.direction, "axial")).toBe(2);
  });
});
