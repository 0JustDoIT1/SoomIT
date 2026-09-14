import { describe, expect, it } from "vitest";
import { getCasePageCount, getVisiblePageNumbers, paginateCases } from "./case-pagination";

describe("case pagination", () => {
  it("shows ten cases per page without losing the remainder", () => {
    const cases = Array.from({ length: 32 }, (_, index) => index + 1);
    expect(getCasePageCount(cases.length)).toBe(4);
    expect(paginateCases(cases, 1).items).toEqual(cases.slice(0, 10));
    expect(paginateCases(cases, 4).items).toEqual([31, 32]);
  });

  it("clamps a page that no longer exists after filtering", () => {
    expect(paginateCases(["검색 결과"], 4)).toEqual({ page: 1, pageCount: 1, items: ["검색 결과"] });
  });

  it("limits the visible page buttons", () => {
    expect(getVisiblePageNumbers(6, 12)).toEqual([4, 5, 6, 7, 8]);
  });
});
