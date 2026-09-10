import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EvidenceViewerPanel } from "./evidence-viewer-panel";

describe("EvidenceViewerPanel", () => {
  it("opens a fixed preview while keeping unsupported annotation actions disabled", async () => {
    const user = userEvent.setup();
    render(<EvidenceViewerPanel />);
    expect(screen.getByText("연결된 영상 주석이 없습니다.")).toBeTruthy();
    for (const label of ["T 소견에 참조", "N 소견에 참조", "M 소견에 참조"]) expect(screen.getByRole("button", { name: label })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "원본 영상 전체화면" }));
    expect(screen.getByRole("dialog", { name: "원본 영상 및 Annotation 전체화면 Viewer" })).toBeTruthy();
    expect(screen.getAllByText("원본 영상 API 연동 대기").length).toBeGreaterThan(0);
  });

  it("shows only fields supplied by a real image asset", () => {
    render(<EvidenceViewerPanel assets={[{ id: "asset-1", image_type: "CT", file_format: "DICOM", status: "READY", storage_type: "ORTHANC" }]} />);
    expect(screen.getByText("CT · DICOM")).toBeTruthy();
    expect(screen.getByText("READY")).toBeTruthy();
    expect(screen.getByText("ORTHANC")).toBeTruthy();
    expect(screen.getByText("Annotation API 연동 대기")).toBeTruthy();
  });

  it("closes the viewer with Escape and restores focus", async () => {
    const user = userEvent.setup();
    render(<EvidenceViewerPanel />);
    const openButton = screen.getByRole("button", { name: "원본 영상 전체화면" });
    await user.click(openButton);
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(openButton).toHaveFocus();
  });
});
