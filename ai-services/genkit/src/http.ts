import { config } from './config.js';

export class UpstreamError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(
  service: string,
  url: string,
  init: RequestInit,
): Promise<T> {
  const signal = AbortSignal.timeout(config.requestTimeoutMs);
  const response = await fetch(url, { ...init, signal });
  const body = await response.text();

  if (!response.ok) {
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { detail?: string };
      detail = parsed.detail ?? body;
    } catch {
      // Keep the upstream response text when it is not JSON.
    }
    throw new UpstreamError(service, response.status, detail || `${service} request failed`);
  }

  return (body ? JSON.parse(body) : {}) as T;
}
