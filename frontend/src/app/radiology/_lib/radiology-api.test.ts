import { beforeEach, expect, it, vi } from "vitest";

import { staffAuthenticatedFetch } from "@/lib/api";

import { uploadRadiologyXrayImage } from "./radiology-api";

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
