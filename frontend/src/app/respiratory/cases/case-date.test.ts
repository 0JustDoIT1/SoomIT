import { describe, expect, it } from "vitest";

import { isSameLocalCalendarDay, sortByUpdatedAtDesc } from "./case-date";

describe("isSameLocalCalendarDay", () => {
  const reference = new Date(2026, 8, 18, 9, 0, 0);

  it("matches a timestamp on the same local calendar day", () => {
    expect(isSameLocalCalendarDay("2026-09-18T00:30:00", reference)).toBe(true);
  });

  it("rejects a different or invalid calendar day", () => {
    expect(isSameLocalCalendarDay("2026-09-17T23:59:59", reference)).toBe(false);
    expect(isSameLocalCalendarDay("not-a-date", reference)).toBe(false);
  });

  it("sorts valid update times first and moves missing timestamps to the end", () => {
    const cases = [
      { id: "missing", updated_at: "" },
      { id: "old", updated_at: "2026-09-17T10:00:00Z" },
      { id: "new", updated_at: "2026-09-18T10:00:00Z" },
      { id: "invalid", updated_at: "unknown" },
    ];

    expect(sortByUpdatedAtDesc(cases).map((item) => item.id)).toEqual(["new", "old", "missing", "invalid"]);
  });
});
