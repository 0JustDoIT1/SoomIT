import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EvidenceViewerPanel, getBrowserImageUrl } from "./evidence-viewer-panel";

describe("EvidenceViewerPanel", () => {
  it("prefers the backend preview URL without exposing a storage URI", () => {
    expect(getBrowserImageUrl({
      id: "asset-1",
      file_format: "DICOM",
      storage_uri: "orthanc://instances/private",
      preview_url: "https://example.test/signed-preview",
    })).toBe("https://example.test/signed-preview");
  });

  it("renders an independent loading state", () => {
    render(<EvidenceViewerPanel loading />);
    expect(screen.getByRole("status")).toHaveTextContent("원본 영상을 불러오는 중입니다.");
  });

  it("retries only the image request from an error state", () => {
    const onRetry = vi.fn();
    render(<EvidenceViewerPanel error="영상 조회 권한이 없습니다." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("영상 조회 권한이 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: "영상만 다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

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
