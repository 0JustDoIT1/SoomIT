import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { staffAuthenticatedFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({ staffAuthenticatedFetch: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("posts the WSI, HALO annotation, and ROI as multipart input", async () => {
  vi.mocked(staffAuthenticatedFetch).mockResolvedValue(
    new Response(JSON.stringify({ upload_ready: true }), { status: 201 }),
  );
  const wsi = new File(["wsi-bytes"], "slide.svs", { type: "application/octet-stream" });
  const annotation = new File(["annotation-bytes"], "slide.annotations", { type: "application/octet-stream" });

  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test");
  const { uploadPdl1Input } = await import("./pathology-workstation-api");
  await uploadPdl1Input("order-1", wsi, annotation, "Tumor-JS");

  const [url, init] = vi.mocked(staffAuthenticatedFetch).mock.calls[0];
  expect(url).toBe("http://api.test/api/pathology/orders/order-1/pdl1-input/");
  expect(init?.method).toBe("POST");
  expect(init?.body).toBeInstanceOf(FormData);
  const body = init?.body as FormData;
  expect(body.get("wsi_file")).toBe(wsi);
  expect(body.get("annotation_file")).toBe(annotation);
  expect(body.get("roi_layer")).toBe("Tumor-JS");
  expect(init?.headers).toBeUndefined();
});

