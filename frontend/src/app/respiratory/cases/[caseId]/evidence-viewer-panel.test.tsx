import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceViewerPanel } from "./evidence-viewer-panel";

describe("EvidenceViewerPanel", () => {
  it("keeps all viewer and annotation actions disabled until the API is connected", () => {
    render(<EvidenceViewerPanel />);
    expect(screen.getByText("연결된 영상 주석이 없습니다.")).toBeTruthy();
    for (const label of ["원본 영상 전체화면", "관심 위치 표시", "T 소견에 참조", "N 소견에 참조", "M 소견에 참조"]) expect(screen.getByRole("button", { name: label })).toBeDisabled();
    expect(screen.getByText("원본 영상 및 Annotation API 연동 후 사용할 수 있습니다.")).toBeTruthy();
  });

  it("shows only fields supplied by a real image asset", () => {
    render(<EvidenceViewerPanel assets={[{ id: "asset-1", image_type: "CT", file_format: "DICOM", status: "READY", storage_type: "ORTHANC" }]} />);
    expect(screen.getByText("CT · DICOM")).toBeTruthy();
    expect(screen.getByText("READY")).toBeTruthy();
    expect(screen.getByText("ORTHANC")).toBeTruthy();
    expect(screen.getByText("Annotation API 연동 대기")).toBeTruthy();
  });

  it("does not open an unsupported viewer", () => {
    render(<EvidenceViewerPanel />);
    expect(screen.getByRole("button", { name: "원본 영상 전체화면" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
