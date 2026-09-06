import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { WholeSlideImage } from "../_lib/pathology-api";
import { WsiViewerPanel } from "./wsi-viewer-panel";

const slide: WholeSlideImage = {
  id: "wsi-1",
  specimen_id: "specimen-1",
  image_asset_id: "asset-1",
  slide_code: "SLIDE-001",
  block_code: null,
  version: 1,
  stain: "HE",
  original_filename: "actual-slide.svs",
  sha256: "hash",
  mpp: "0.25",
  is_current: true,
  storage_uri: "n:/pathology/actual-slide.svs",
  file_format: "SVS",
  image_status: "READY",
  invalidated_at: null,
  invalidation_reason: null,
  created_at: "2026-09-07T00:00:00Z",
  updated_at: "2026-09-07T00:00:00Z",
};

describe("WsiViewerPanel", () => {
  it("shows the provided empty state without inventing a slide", () => {
    render(
      <WsiViewerPanel
        slide={null}
        loading={false}
        emptyMessage="선택한 검체에 등록된 WSI가 없습니다."
      />,
    );

    expect(
      screen.getByText("선택한 검체에 등록된 WSI가 없습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText("WSI 원본 영상 API 연동 대기")).not.toBeInTheDocument();
  });

  it("shows only supplied metadata while the viewer API is unavailable", () => {
    render(
      <WsiViewerPanel slide={slide} loading={false} emptyMessage="표시할 WSI가 없습니다." />,
    );

    expect(screen.getByText("WSI 원본 영상 API 연동 대기")).toBeInTheDocument();
    expect(screen.getByText("SLIDE-001")).toBeInTheDocument();
    expect(screen.getByText("actual-slide.svs")).toBeInTheDocument();
    expect(screen.getByText("n:/pathology/actual-slide.svs")).toBeInTheDocument();
    expect(screen.getByText("SVS")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
