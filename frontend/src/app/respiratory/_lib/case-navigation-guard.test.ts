import { describe, expect, it } from "vitest";

import {
  CASE_NAVIGATION_REQUEST_EVENT,
  getRequestedCaseId,
  requestCaseNavigation,
} from "./case-navigation-guard";

describe("case navigation guard", () => {
  it("allows a Case move when no workspace cancels it", () => {
    expect(requestCaseNavigation("case-1")).toBe(true);
  });

  it("exposes the target Case and honors a cancelled request", () => {
    const listener = (event: Event) => {
      expect(getRequestedCaseId(event)).toBe("case-2");
      event.preventDefault();
    };
    window.addEventListener(CASE_NAVIGATION_REQUEST_EVENT, listener);

    expect(requestCaseNavigation("case-2")).toBe(false);

    window.removeEventListener(CASE_NAVIGATION_REQUEST_EVENT, listener);
  });
});
