import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { CaseDicomEvidence } from "./case-dicom-evidence";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/toast/toast", () => ({
  showToast: { error: toastError, success: vi.fn() },
}));

vi.mock("../../../radiology/_lib/cornerstone-init", () => ({
  ensureCornerstoneInitialized: vi.fn(),
}));

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  toastError.mockClear();
});

it("prevents the browser menu only on the PET/CT Cornerstone surface", () => {
  const authorizedFetch = vi.fn(() => new Promise<Response>(() => undefined));
  render(<CaseDicomEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-context-menu" stage="PET_CT_TNM" />);

  const viewer = screen.getByLabelText("DICOM 원본 영상 뷰어. 좌우 화살표로 슬라이스 이동");
  const bubbled = vi.fn();
  viewer.parentElement?.addEventListener("contextmenu", bubbled);
  const viewerEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  viewer.dispatchEvent(viewerEvent);
  expect(viewerEvent.defaultPrevented).toBe(true);
  expect(bubbled).toHaveBeenCalledOnce();

  const outsideEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  screen.getByRole("heading", { level: 2 }).dispatchEvent(outsideEvent);
  expect(outsideEvent.defaultPrevented).toBe(false);
});

it("loads an empty PET annotation list with the selected asset and Series UID", async () => {
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "pet-empty", workflow_stage: "PET_CT_TNM", image_type: "PET", file_format: "DICOM", status: "READY", series_instance_uid: "series-pet-empty" }]);
    if (url.endsWith("/dicom-web/instances/")) return json([]);
    if (url.includes("/image-annotations/")) return json([]);
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<CaseDicomEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-pet-empty" stage="PET_CT_TNM" />);

  await waitFor(() => expect(authorizedFetch.mock.calls.some(([url]) => String(url).includes("/image-annotations/"))).toBe(true));
  const annotationUrl = String(authorizedFetch.mock.calls.find(([url]) => String(url).includes("/image-annotations/"))?.[0]);
  expect(annotationUrl).toContain("image_asset_id=pet-empty");
  expect(annotationUrl).toContain("series_instance_uid=series-pet-empty");
  expect(toastError).not.toHaveBeenCalled();
});

it("does not request PET annotations before the Series UID is ready", async () => {
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return json([{ id: "pet-no-series", workflow_stage: "PET_CT_TNM", image_type: "PET", file_format: "DICOM", status: "READY", series_instance_uid: null }]);
    if (url.endsWith("/dicom-web/instances/")) return json([]);
    throw new Error(`Unexpected URL: ${url}`);
  });

  render(<CaseDicomEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-pet-no-series" stage="PET_CT_TNM" />);

  expect(await screen.findByRole("button", { name: "PET Series" })).toBeInTheDocument();
  expect(authorizedFetch.mock.calls.some(([url]) => String(url).includes("/image-annotations/"))).toBe(false);
  expect(toastError).not.toHaveBeenCalled();
});

it("ignores a failed stale annotation response after selecting another series", async () => {
  let resolveFirstAnnotation!: (response: Response) => void;
  const authorizedFetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/image-assets/")) return Promise.resolve(json([
      { id: "ct-old", workflow_stage: "PET_CT_TNM", image_type: "CT", file_format: "DICOM", status: "READY", series_instance_uid: "series-old" },
      { id: "pet-current", workflow_stage: "PET_CT_TNM", image_type: "PET", file_format: "DICOM", status: "READY", series_instance_uid: "series-current" },
    ]));
    if (url.endsWith("/dicom-web/instances/")) return Promise.resolve(json([]));
    if (url.includes("image_asset_id=ct-old")) {
      return new Promise<Response>((resolve) => {
        resolveFirstAnnotation = resolve;
      });
    }
    if (url.includes("image_asset_id=pet-current")) return Promise.resolve(json([]));
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });

  render(<CaseDicomEvidence apiBaseUrl="http://test" authorizedFetch={authorizedFetch} caseId="case-series-switch" stage="PET_CT_TNM" />);
  fireEvent.click(await screen.findByRole("button", { name: "PET Series" }));
  await waitFor(() => expect(authorizedFetch.mock.calls.some(([url]) => String(url).includes("image_asset_id=pet-current"))).toBe(true));

  await act(async () => {
    resolveFirstAnnotation(json({ detail: "Old series failed." }, 503));
    await Promise.resolve();
  });
  expect(screen.queryByText("주석 조회 불가")).not.toBeInTheDocument();
  expect(toastError).not.toHaveBeenCalled();
});
