type AuthorizedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type AnnotationRequestIdentity = {
  apiBaseUrl: string;
  caseId: string;
  imageAssetId: string;
  seriesInstanceUid: string;
};

type AnnotationRequestEntry = {
  promise: Promise<unknown[]>;
  expiresAt: number;
};

const SUCCESS_CACHE_MS = 60_000;
const FAILURE_COOLDOWN_MS = 10_000;
const annotationRequests = new Map<string, AnnotationRequestEntry>();
const notifiedFailures = new Set<string>();
const fetchScopes = new WeakMap<AuthorizedFetch, number>();
let nextFetchScope = 1;

export class ImageAnnotationLoadError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ImageAnnotationLoadError";
  }
}

export function imageAnnotationRequestKey({
  caseId,
  imageAssetId,
  seriesInstanceUid,
}: Omit<AnnotationRequestIdentity, "apiBaseUrl">) {
  return `${caseId.trim()}:${imageAssetId.trim()}:${seriesInstanceUid.trim()}`;
}

function responseDetail(body: unknown, fallback: string) {
  return body &&
    typeof body === "object" &&
    "detail" in body &&
    typeof body.detail === "string"
    ? body.detail
    : fallback;
}

function requestCacheKey(
  apiBaseUrl: string,
  authorizedFetch: AuthorizedFetch,
  identityKey: string,
) {
  let scope = fetchScopes.get(authorizedFetch);
  if (!scope) {
    scope = nextFetchScope;
    nextFetchScope += 1;
    fetchScopes.set(authorizedFetch, scope);
  }
  return `${scope}:${apiBaseUrl}:${identityKey}`;
}

export function loadImageAnnotations<T>({
  apiBaseUrl,
  authorizedFetch,
  caseId,
  imageAssetId,
  seriesInstanceUid,
}: AnnotationRequestIdentity & { authorizedFetch: AuthorizedFetch }): Promise<T[]> {
  const normalized = {
    caseId: caseId.trim(),
    imageAssetId: imageAssetId.trim(),
    seriesInstanceUid: seriesInstanceUid.trim(),
  };
  if (!normalized.caseId || !normalized.imageAssetId || !normalized.seriesInstanceUid) {
    return Promise.resolve([]);
  }

  const identityKey = imageAnnotationRequestKey(normalized);
  const key = requestCacheKey(apiBaseUrl, authorizedFetch, identityKey);
  const cached = annotationRequests.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise as Promise<T[]>;
  }
  annotationRequests.delete(key);

  const entry = {} as AnnotationRequestEntry;
  const request = (async () => {
    const query = new URLSearchParams({
      image_asset_id: normalized.imageAssetId,
      series_instance_uid: normalized.seriesInstanceUid,
    });
    const response = await authorizedFetch(
      `${apiBaseUrl}/api/doctor/cases/${normalized.caseId}/image-annotations/?${query.toString()}`,
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ImageAnnotationLoadError(
        responseDetail(body, `Annotation request failed with status ${response.status}.`),
        response.status,
      );
    }
    if (!Array.isArray(body)) {
      throw new ImageAnnotationLoadError("Annotation response must be an array.", response.status);
    }
    return body;
  })()
    .then((annotations) => {
      entry.expiresAt = Date.now() + SUCCESS_CACHE_MS;
      notifiedFailures.delete(identityKey);
      return annotations;
    })
    .catch((error: unknown) => {
      entry.expiresAt = Date.now() + FAILURE_COOLDOWN_MS;
      throw error;
    });

  entry.promise = request;
  entry.expiresAt = Number.POSITIVE_INFINITY;
  annotationRequests.set(key, entry);
  return request as Promise<T[]>;
}

export function invalidateImageAnnotationRequest(identity: Omit<AnnotationRequestIdentity, "apiBaseUrl">) {
  const key = imageAnnotationRequestKey(identity);
  for (const cachedKey of annotationRequests.keys()) {
    if (cachedKey.endsWith(`:${key}`)) annotationRequests.delete(cachedKey);
  }
  notifiedFailures.delete(key);
}

export function shouldNotifyImageAnnotationLoadFailure(key: string) {
  if (notifiedFailures.has(key)) return false;
  notifiedFailures.add(key);
  return true;
}
