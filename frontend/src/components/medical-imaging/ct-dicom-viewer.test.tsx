import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CtDicomViewer } from "./ct-dicom-viewer";

function dispatchContextMenu(element: Element) {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  element.dispatchEvent(event);
  return event;
}

describe("CtDicomViewer toolbar", () => {
  it("prevents the browser menu on every interactive viewport without stopping propagation", () => {
    render(<CtDicomViewer orderId="order-context" assetId="asset-context" loadSeries={() => new Promise(() => undefined)} />);

    for (const name of ["CT Axial viewer", "CT Coronal viewer", "CT Sagittal viewer", "CT 3D Volume viewer"]) {
      const viewport = screen.getByLabelText(name);
      const bubbled = vi.fn();
      viewport.parentElement?.addEventListener("contextmenu", bubbled);
      expect(dispatchContextMenu(viewport).defaultPrevented).toBe(true);
      expect(bubbled).toHaveBeenCalledOnce();
    }

    const axial = screen.getByLabelText("CT Axial viewer");
    for (const event of [
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 1 }),
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 }),
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 1 }),
    ]) {
      axial.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(dispatchContextMenu(screen.getByRole("toolbar")).defaultPrevented).toBe(false);
  });

  it("keeps context-menu suppression scoped after viewer unmount and remount", () => {
    const firstMount = render(<CtDicomViewer orderId="order-lifecycle" assetId="asset-lifecycle" loadSeries={() => new Promise(() => undefined)} />);
    expect(dispatchContextMenu(screen.getByLabelText("CT Axial viewer")).defaultPrevented).toBe(true);
    firstMount.unmount();

    const outsideEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
    document.body.dispatchEvent(outsideEvent);
    expect(outsideEvent.defaultPrevented).toBe(false);

    render(<CtDicomViewer orderId="order-lifecycle" assetId="asset-lifecycle" loadSeries={() => new Promise(() => undefined)} />);
    const viewport = screen.getByLabelText("CT Axial viewer");
    const bubbled = vi.fn();
    viewport.parentElement?.addEventListener("contextmenu", bubbled);
    expect(dispatchContextMenu(viewport).defaultPrevented).toBe(true);
    expect(bubbled).toHaveBeenCalledOnce();
  });

  it("renders the compact toolbar and toggles the layout controls", () => {
    render(<CtDicomViewer orderId="order-1" assetId="asset-1" loadSeries={() => new Promise(() => undefined)} />);

    expect(screen.getByRole("toolbar", { name: "CT Viewer 도구" })).toHaveClass("flex-wrap");
    expect(screen.getByRole("toolbar", { name: "CT Viewer 도구" })).not.toHaveClass("overflow-x-auto");
    expect(screen.getByRole("button", { name: "WL/WW" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "측정" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ROI" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "1×1" }));
    expect(screen.getByRole("button", { name: "1×1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "2×2" }));
    expect(screen.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("selects the first real nodule and allows switching the requested focus", () => {
    const onFocusedNoduleChange = vi.fn();
    render(
      <CtDicomViewer
        orderId="order-nodules"
        assetId="asset-nodules"
        loadSeries={() => new Promise(() => undefined)}
        nodules={[
          { nodule_no: 1, finding_payload: { quantification: { centroid_world_xyz_mm: [10, 20, 30] } } },
          { nodule_no: 2, finding_payload: { quantification: { centroid_world_xyz_mm: [40, 50, 60] } } },
        ]}
        onFocusedNoduleChange={onFocusedNoduleChange}
      />,
    );

    expect(screen.getByRole("button", { name: "결절 #1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "결절 #2" }));
    expect(screen.getByRole("button", { name: "결절 #2" })).toHaveAttribute("aria-pressed", "true");
    expect(onFocusedNoduleChange).toHaveBeenCalledWith("2");
  });

  it("accepts an external nodule selection from the clinical detail rail", () => {
    const props = {
      orderId: "order-controlled",
      assetId: "asset-controlled",
      loadSeries: () => new Promise<never>(() => undefined),
      nodules: [
        { nodule_no: 1, finding_payload: { quantification: { centroid_world_xyz_mm: [10, 20, 30] } } },
        { nodule_no: 2, finding_payload: { quantification: { centroid_world_xyz_mm: [40, 50, 60] } } },
      ],
    };
    const { rerender } = render(<CtDicomViewer {...props} focusedNoduleId="1" />);

    rerender(<CtDicomViewer {...props} focusedNoduleId="2" />);
    expect(screen.getByRole("button", { name: "결절 #2" })).toHaveAttribute("aria-pressed", "true");
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
