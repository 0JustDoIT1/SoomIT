import { beforeEach, expect, it, vi } from "vitest";

import { staffAuthenticatedFetch } from "@/lib/api";

import {
  fetchRadiologyCompletedExams,
  fetchRadiologyXrayImage,
  resetRadiologyPetTnmAnalysis,
  uploadRadiologyXrayImage,
} from "./radiology-api";

vi.mock("@/lib/api", () => ({ staffAuthenticatedFetch: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test";
});

it("posts the selected X-ray file as multipart form data", async () => {
  vi.mocked(staffAuthenticatedFetch).mockResolvedValue(
    new Response(JSON.stringify({ id: "asset-1", status: "READY" }), { status: 201 }),
  );

  await uploadRadiologyXrayImage("order-1", new File(["png-bytes"], "chest.png", { type: "image/png" }));

  const [url, init] = vi.mocked(staffAuthenticatedFetch).mock.calls[0];
  expect(url).toBe("http://api.test/api/radiology/orders/order-1/images/upload/");
  expect(init?.method).toBe("POST");
  expect(init?.body).toBeInstanceOf(FormData);
  expect((init?.body as FormData).get("image")).toBeInstanceOf(File);
  expect(init?.headers).not.toHaveProperty("Content-Type");
});

it("loads a registered X-ray through the authenticated backend endpoint", async () => {
  vi.mocked(staffAuthenticatedFetch).mockResolvedValue(
    new Response("image-bytes", { status: 200, headers: { "Content-Type": "image/png" } }),
  );

  const blob = await fetchRadiologyXrayImage("order-1", "asset-1");

  expect(blob.type).toBe("image/png");
  expect(staffAuthenticatedFetch).toHaveBeenCalledWith(
    "http://api.test/api/radiology/orders/order-1/images/asset-1/content/",
    expect.objectContaining({ method: "GET" }),
  );
});

it("loads completed radiology exam history through the grouped history endpoint", async () => {
  vi.mocked(staffAuthenticatedFetch).mockResolvedValue(
    new Response(JSON.stringify([]), { status: 200 }),
  );

  await expect(fetchRadiologyCompletedExams()).resolves.toEqual([]);

  expect(staffAuthenticatedFetch).toHaveBeenCalledWith(
    "http://api.test/api/radiology/completed-exams/",
    expect.objectContaining({ method: "GET" }),
  );
});

it("resets only the failed PET-TNM analysis through the order reset endpoint", async () => {
  vi.mocked(staffAuthenticatedFetch).mockResolvedValue(
    new Response(JSON.stringify({ order_id: "order-1", analysis_id: "analysis-1", invalidated_asset_id: "asset-1" }), { status: 200 }),
  );

  await expect(resetRadiologyPetTnmAnalysis("order-1")).resolves.toEqual({
    order_id: "order-1",
    analysis_id: "analysis-1",
    invalidated_asset_id: "asset-1",
  });

  expect(staffAuthenticatedFetch).toHaveBeenCalledWith(
    "http://api.test/api/radiology/orders/order-1/pet-tnm-analysis/reset/",
    expect.objectContaining({ method: "POST" }),
  );
});
