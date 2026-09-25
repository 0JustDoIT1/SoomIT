import { describe, expect, it, vi } from "vitest";

import { markNotificationRead, mergeNotificationSnapshot, publishNotificationSnapshot, readNotificationPayload, subscribeNotificationSnapshot, type NotificationState } from "./notification-state";

function state(unreadCount: number, rows: Array<[string, string | null]>): NotificationState {
  return {
    unread_count: unreadCount,
    results: rows.map(([id, read_at]) => ({ id, read_at, notification_type: "SYSTEM", title: id, message: id, case_id: null, case_code: null, created_at: "2026-09-25T00:00:00Z" })),
  };
}

describe("notification state", () => {
  it.each([[0], [1], [5]])("accepts an unread count of %i", (count) => {
    expect(readNotificationPayload({ unread_count: count, results: [] }).unread_count).toBe(count);
  });

  it("decrements once when an unread notification becomes read", () => {
    const once = markNotificationRead(state(2, [["a", null], ["b", null]]), "a", "read-a");
    const twice = markNotificationRead(once, "a", "read-a-later");
    expect(once).toEqual(state(1, [["a", "read-a"], ["b", null]]));
    expect(twice).toBe(once);
  });

  it("handles several consecutive reads without a negative count", () => {
    const first = markNotificationRead(state(2, [["a", null], ["b", null]]), "a", "read-a");
    const second = markNotificationRead(first, "b", "read-b");
    expect(second.unread_count).toBe(0);
  });

  it("does not let a stale polling response restore a locally read row", () => {
    const current = state(0, [["a", "read-a"]]);
    expect(mergeNotificationSnapshot(current, state(1, [["a", null]]))).toEqual(current);
  });

  it("adds a newly arrived notification while preserving existing read state", () => {
    const current = state(0, [["a", "read-a"]]);
    expect(mergeNotificationSnapshot(current, state(2, [["b", null], ["a", null]]))).toEqual(state(1, [["b", null], ["a", "read-a"]]));
  });

  it("delivers a polling snapshot to other notification surfaces", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeNotificationSnapshot(callback);
    const incoming = state(1, [["new", null]]);

    publishNotificationSnapshot(incoming);

    expect(callback).toHaveBeenCalledWith(incoming);
    unsubscribe();
  });
});
