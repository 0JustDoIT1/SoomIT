import { describe, expect, it } from "vitest";

import { formatPrescriptionDose } from "./prescription-dose-format";

describe("formatPrescriptionDose", () => {
  it.each([
    ["80.000", "80"],
    ["3.000", "3"],
    ["80.125", "80.125"],
    [0, "0"],
    [null, ""],
  ])("formats %s as %s without changing its numeric meaning", (value, expected) => {
    expect(formatPrescriptionDose(value)).toBe(expected);
  });
});
