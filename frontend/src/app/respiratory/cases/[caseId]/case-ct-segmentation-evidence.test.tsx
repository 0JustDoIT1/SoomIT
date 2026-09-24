import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { CaseCtSegmentationEvidence } from "./case-ct-segmentation-evidence";

const addDicomFile = vi.hoisted(() => vi.fn((file: File) => `wadouri:${file.name}`));

vi.mock("@/app/radiology/_lib/cornerstone-init", () => ({
  ensureCornerstoneInitialized: vi.fn().mockResolvedValue({
    dicomImageLoader: { wadouri: { fileManager: { add: addDicomFile } } },
  }),
}));

vi.mock("@/components/medical-imaging/ct-dicom-viewer", () => ({
  CtDicomViewer: ({ orderId, assetId, loadSeries, loadSegmentation }: {
    orderId: string;
    assetId: string;
    loadSeries: (orderId: string, assetId: string) => Promise<unknown>;
    loadSegmentation: (analysisId: string) => Promise<unknown>;
  }) => <div data-testid="ct-viewer">
    <button type="button" onClick={() => void loadSeries(orderId, assetId)}>load-series</button>
    <button type="button" onClick={() => void loadSegmentation("analysis-cache")}>load-segmentation</button>
  </div>,
}));

vi.mock("./case-ct-visualization", () => ({ CaseCtVisualization: () => <div>3D visualization</div> }));

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function createFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "asset-cache", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: "series-cache" }]);
    if (url.includes("/image-annotations/")) return json([]);
    if (url.endsWith("/dicom-web/instances/")) return json([
      { "00080018": { Value: ["sop-1"] } },
      { "00080018": { Value: ["sop-2"] } },
    ]);
    if (url.includes("/dicom-web/instances/")) return new Response(new Blob([new Uint8Array([1])]));
    if (url.endsWith("/segmentation/")) return json({
      schema_version: "test",
      scalar_type: "uint8",
      dimensions: [1, 1, 1],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      segments: [{ segment_index: 1, id: "N001", name: "Nodule", category: "NODULE", color: [255, 0, 0] }],
    });
    if (url.endsWith("/segmentation/labelmap/")) return new Response(new Uint8Array([1]));
    throw new Error(`Unexpected URL: ${url}`);
  });
}

it("reuses CT series and segmentation requests after remounting the same Case series", async () => {
  const authorizedFetch = createFetch();
  const props = { apiBaseUrl: "http://test", authorizedFetch, caseId: "case-cache", analysisId: "analysis-cache" };
  const first = render(<CaseCtSegmentationEvidence {...props} />);

  fireEvent.click(await screen.findByRole("button", { name: "load-series" }));
  fireEvent.click(screen.getByRole("button", { name: "load-segmentation" }));
  await waitFor(() => expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/dicom-web/instances/"))).toHaveLength(3));
  await waitFor(() => expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/segmentation/"))).toHaveLength(2));
  first.unmount();

  render(<CaseCtSegmentationEvidence {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "load-series" }));
  fireEvent.click(screen.getByRole("button", { name: "load-segmentation" }));

  await waitFor(() => expect(authorizedFetch.mock.calls.filter(([url]) => String(url).endsWith("/image-assets/"))).toHaveLength(1));
  expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/dicom-web/instances/"))).toHaveLength(3);
  expect(authorizedFetch.mock.calls.filter(([url]) => String(url).includes("/segmentation/"))).toHaveLength(2);
});

it("keeps the original CT viewer mounted while visiting the 3D view", async () => {
  const authorizedFetch = createFetch();
  render(<CaseCtSegmentationEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-view-toggle" analysisId="analysis-view-toggle" />);

  expect(await screen.findByTestId("ct-viewer")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "분할 / 3D" }));
  expect(screen.getByTestId("ct-viewer")).toBeInTheDocument();
  expect(screen.getByText("3D visualization")).toBeInTheDocument();
});
