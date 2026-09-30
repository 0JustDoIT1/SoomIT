import { expect, it, vi } from "vitest";
import { deleteImageAnnotations } from "./delete-image-annotations";

it("removes drafts locally without requesting a server deletion", async () => {
  const fetcher = vi.fn();
  const result = await deleteImageAnnotations(fetcher, "/annotations/?slide=1", [{ id: "temp-1" }]);
  expect([...result.deleted]).toEqual(["temp-1"]);
  expect(fetcher).not.toHaveBeenCalled();
});

it("falls back on 405 and keeps failed records for retry", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 405 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  const result = await deleteImageAnnotations(fetcher, "/annotations/?slide=1", [{ id: "temp-1" }, { id: "a" }, { id: "b" }, { id: "c" }]);
  expect(result.failed).toBe(true);
  expect([...result.deleted].sort()).toEqual(["a", "c", "temp-1"]);
  expect(fetcher).toHaveBeenCalledWith("/annotations/a/", { method: "DELETE" });
});

it("does not fall back on permission failure", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
  await expect(deleteImageAnnotations(fetcher, "/annotations/", [{ id: "a" }])).rejects.toThrow("403");
  expect(fetcher).toHaveBeenCalledOnce();
});
