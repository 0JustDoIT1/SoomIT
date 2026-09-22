import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

  it("selects a saved text annotation before updating or deleting it", () => {
    const onAnnotationUpdated = vi.fn();
    const onAnnotationDeleted = vi.fn();
    render(
      <CtDicomViewer
        orderId="order-1"
        assetId="asset-1"
        loadSeries={() => new Promise(() => undefined)}
        annotations={[{
          id: "annotation-1",
          annotation_type: "TEXT",
          annotation_data: { text: "기존 메모", series_instance_uid: "series-1", sop_instance_uid: "sop-1", tool_name: "ArrowAnnotateTool" },
        }]}
        onAnnotationUpdated={onAnnotationUpdated}
        onAnnotationDeleted={onAnnotationDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Text 1" }));
    const text = screen.getByRole("textbox", { name: "선택한 텍스트 주석 내용" });
    expect(text).toHaveValue("기존 메모");
    fireEvent.change(text, { target: { value: "수정 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "텍스트 저장" }));
    expect(onAnnotationUpdated).toHaveBeenCalledWith("annotation-1", expect.objectContaining({ annotation_type: "TEXT", annotation_data: expect.objectContaining({ text: "수정 메모" }) }));
    fireEvent.click(screen.getByRole("button", { name: "주석 삭제" }));
    expect(onAnnotationDeleted).toHaveBeenCalledWith("annotation-1");
  });
});
