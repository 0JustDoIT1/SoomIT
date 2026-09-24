import { describe, expect, it, vi } from "vitest";

import {
  ImageAnnotationLoadError,
  imageAnnotationRequestKey,
  loadImageAnnotations,
  shouldNotifyImageAnnotationLoadFailure,
} from "./image-annotation-request";

const identity = (suffix: string) => ({
  apiBaseUrl: "http://test",
  caseId: `case-${suffix}`,
  imageAssetId: `asset-${suffix}`,
  seriesInstanceUid: `series-${suffix}`,
});

describe("image annotation requests", () => {
  it("does not call the API until the asset and Series UID are ready", async () => {
    const authorizedFetch = vi.fn();

    await expect(loadImageAnnotations({
      ...identity("missing-series"),
      seriesInstanceUid: "",
      authorizedFetch,
    })).resolves.toEqual([]);

    expect(authorizedFetch).not.toHaveBeenCalled();
  });

  it("treats a 200 empty array as a successful empty result and sends both identifiers", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await expect(loadImageAnnotations({
      ...identity("empty"),
      authorizedFetch,
    })).resolves.toEqual([]);

    expect(String(authorizedFetch.mock.calls[0][0])).toContain(
      "image_asset_id=asset-empty&series_instance_uid=series-empty",
    );
  });

  it("deduplicates concurrent and immediate repeat requests for the same Case series", async () => {
    let resolveRequest!: (response: Response) => void;
    const authorizedFetch = vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));
    const request = { ...identity("dedupe"), authorizedFetch };

    const first = loadImageAnnotations(request);
    const second = loadImageAnnotations(request);
    expect(authorizedFetch).toHaveBeenCalledOnce();

    resolveRequest(new Response(JSON.stringify([{ id: "annotation-1" }]), { status: 200 }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      [{ id: "annotation-1" }],
      [{ id: "annotation-1" }],
    ]);
    await loadImageAnnotations(request);
    expect(authorizedFetch).toHaveBeenCalledOnce();
  });

  it("keeps failures distinct from empty results and notifies once per request identity", async () => {
    const requestIdentity = identity("failure");
    const authorizedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Annotation endpoint unavailable." }), { status: 503 }),
    );
    const request = { ...requestIdentity, authorizedFetch };

    await expect(loadImageAnnotations(request)).rejects.toMatchObject({
      status: 503,
      message: "Annotation endpoint unavailable.",
    });
    await expect(loadImageAnnotations(request)).rejects.toBeInstanceOf(ImageAnnotationLoadError);
    expect(authorizedFetch).toHaveBeenCalledOnce();

    const key = imageAnnotationRequestKey(requestIdentity);
    expect(shouldNotifyImageAnnotationLoadFailure(key)).toBe(true);
    expect(shouldNotifyImageAnnotationLoadFailure(key)).toBe(false);
  });

  it("does not reuse one Case or series response for another request identity", async () => {
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(JSON.stringify([
        { id: url.includes("series-a") ? "annotation-a" : "annotation-b" },
      ]), { status: 200 });
    });

    await expect(loadImageAnnotations({ ...identity("a"), authorizedFetch })).resolves.toEqual([
      { id: "annotation-a" },
    ]);
    await expect(loadImageAnnotations({ ...identity("b"), authorizedFetch })).resolves.toEqual([
      { id: "annotation-b" },
    ]);
    expect(authorizedFetch).toHaveBeenCalledTimes(2);
  });

  it("does not share cached clinical data across authenticated fetch scopes", async () => {
    const requestIdentity = identity("auth-scope");
    const firstFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "first-session" }]), { status: 200 }),
    );
    const secondFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "second-session" }]), { status: 200 }),
    );

    await expect(loadImageAnnotations({ ...requestIdentity, authorizedFetch: firstFetch })).resolves.toEqual([
      { id: "first-session" },
    ]);
    await expect(loadImageAnnotations({ ...requestIdentity, authorizedFetch: secondFetch })).resolves.toEqual([
      { id: "second-session" },
    ]);
    expect(firstFetch).toHaveBeenCalledOnce();
    expect(secondFetch).toHaveBeenCalledOnce();
  });
});
