import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type { WholeSlideImage } from "../_lib/pathology-api";
import { OrthancWsiViewer } from "./orthanc-wsi-viewer";

const mocks = vi.hoisted(() => {
  const viewer = {
    addHandler: vi.fn((name: string, handler: () => void) => { if (name === "open") queueMicrotask(handler); }),
    removeHandler: vi.fn(),
    destroy: vi.fn(),
    forceRedraw: vi.fn(),
    setMouseNavEnabled: vi.fn(),
    viewport: {
      getCenter: vi.fn(() => ({ x: 0.5, y: 0.25 })), getZoom: vi.fn(() => 1), goHome: vi.fn(),
      panTo: vi.fn(), zoomTo: vi.fn(), applyConstraints: vi.fn(), pointFromPixel: vi.fn((point: unknown) => point),
      viewportToImageCoordinates: vi.fn((point: unknown) => point), imageToViewerElementCoordinates: vi.fn((point: unknown) => point),
    },
  };
  const osd = vi.fn(() => viewer) as unknown as ReturnType<typeof vi.fn> & { Point: new (x: number, y: number) => { x: number; y: number } };
  osd.Point = class Point { constructor(public x: number, public y: number) {} };
  return { fetch: vi.fn(), osd, viewer };
});

vi.mock("@/lib/api", () => ({ API_BASE_URL: "http://api.test", staffAuthenticatedFetch: mocks.fetch }));
vi.mock("openseadragon", () => ({ default: mocks.osd }));

const slide = {
  id: "slide-1", specimen_id: "specimen-1", image_asset_id: "asset-1", slide_code: "WSI-1",
  block_code: null, version: 1, stain: "HE", original_filename: "slide.svs", sha256: "hash", mpp: "0.25",
  is_current: true, storage_uri: "gs://bucket/slide.svs", file_format: "SVS", image_status: "READY",
  orthanc_series_id: "orthanc-series", orthanc_instance_id: null, study_instance_uid: null,
  series_instance_uid: null, sop_instance_uid: null, invalidated_at: null, invalidation_reason: null,
  created_at: "2026-09-25T00:00:00Z", updated_at: "2026-09-25T00:00:00Z",
} satisfies WholeSlideImage;

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.osd.mockClear();
  mocks.viewer.viewport.goHome.mockClear();
  sessionStorage.setItem("accessToken", "pathology-jwt");
  mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => String(input).endsWith("/pyramid/")
    ? new Response(JSON.stringify({ width: 4608, height: 2304, tile_width: 512, tile_height: 512, resolutions: [1, 4, 12], sizes: [[4608, 2304], [1024, 512], [384, 192]], tile_url_template: "/tiles/{level}/{x}/{y}/" }), { status: 200 })
    : new Response(null, { status: 404 }));
});

it("uses the staff JWT for pathology WSI tiles without exposing annotation drawing", async () => {
  render(<OrthancWsiViewer slide={slide} caseId="case-1" fillHeight />);

  expect(await screen.findByLabelText("WSI-1 WSI 뷰어")).toBeInTheDocument();
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mocks.osd).toHaveBeenCalledTimes(1));
  expect(String(mocks.fetch.mock.calls[0][0])).toBe("http://api.test/api/pathology/wsis/slide-1/pyramid/");
  expect(screen.queryByText("Point")).not.toBeInTheDocument();
  expect(screen.queryByText("ROI")).not.toBeInTheDocument();
  expect(mocks.osd.mock.calls[0][0].ajaxHeaders).toEqual({ Authorization: "Bearer pathology-jwt" });
  expect(mocks.viewer.viewport.goHome).toHaveBeenCalledWith(true);
});
