type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function deleteImageAnnotations(fetcher: Fetcher, endpoint: string, annotations: readonly { id: string }[]) {
  const deleted = new Set(annotations.filter(({ id }) => id.startsWith("temp-")).map(({ id }) => id));
  const persisted = annotations.filter(({ id }) => !deleted.has(id));
  if (!persisted.length) return { deleted, failed: false };
  const response = await fetcher(endpoint, { method: "DELETE" });
  if (response.ok) return { deleted: new Set(annotations.map(({ id }) => id)), failed: false };
  if (response.status !== 405) throw new Error(`주석을 삭제하지 못했습니다. (${response.status})`);
  const base = endpoint.split("?")[0].replace(/\/$/, "");
  // Limit concurrent requests when a slide contains many annotations.
  let failed = false;
  for (let offset = 0; offset < persisted.length; offset += 4) {
    await Promise.all(persisted.slice(offset, offset + 4).map(async ({ id }) => {
      try {
        const result = await fetcher(`${base}/${encodeURIComponent(id)}/`, { method: "DELETE" });
        if (result.ok || result.status === 404) deleted.add(id);
        else failed = true;
      } catch { failed = true; }
    }));
  }
  return { deleted, failed };
}
