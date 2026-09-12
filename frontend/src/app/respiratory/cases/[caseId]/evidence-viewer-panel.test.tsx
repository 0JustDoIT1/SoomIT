import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EvidenceViewerPanel } from "./evidence-viewer-panel";

describe("EvidenceViewerPanel", () => {
  it("shows an honest inline empty state while the image API is unavailable", () => {
    render(<EvidenceViewerPanel />);
    expect(screen.getByText("표시 가능한 원본 영상이 없습니다.")).toBeTruthy();
    expect(screen.getByText("연결된 영상이 없습니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "크게 보기" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows real metadata but does not pretend a DICOM URI is browser-viewable", () => {
    render(<EvidenceViewerPanel assets={[{ id: "asset-1", image_type: "CT", file_format: "DICOM", status: "READY", storage_type: "ORTHANC", storage_uri: "orthanc://instances/1" }]} />);
    expect(screen.getByText("CT · DICOM")).toBeTruthy();
    expect(screen.getByText("ORTHANC · READY")).toBeTruthy();
    expect(screen.getByText("현재 저장소 형식은 영상 제공 API 연결 후 이 영역에 표시됩니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "크게 보기" })).toBeDisabled();
  });

  it("renders a browser image inline and expands the same viewer without a modal", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: requestFullscreen });
    render(<EvidenceViewerPanel assets={[{ id: "asset-1", image_type: "XRAY", file_format: "PNG", storage_uri: "https://example.test/xray.png" }]} />);
    expect(screen.getByRole("img", { name: "XRAY 원본 영상" })).toHaveAttribute("src", "https://example.test/xray.png");
    fireEvent.click(screen.getByRole("button", { name: "크게 보기" }));
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
