import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CtDicomViewer } from "./ct-dicom-viewer";

describe("CtDicomViewer toolbar", () => {
  it("renders the compact toolbar and toggles the layout controls", () => {
    render(<CtDicomViewer orderId="order-1" assetId="asset-1" loadSeries={() => new Promise(() => undefined)} />);

    expect(screen.getByRole("toolbar", { name: "CT Viewer 도구" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "WL/WW" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "측정" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ROI" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "1×1" }));
    expect(screen.getByRole("button", { name: "1×1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "2×2" }));
    expect(screen.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
  });
});
