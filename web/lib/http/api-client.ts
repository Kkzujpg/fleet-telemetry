import { createRefreshQueue } from "./refresh-queue";

const BACKEND_HTTP_URL =
  process.env.NEXT_PUBLIC_BACKEND_HTTP_URL ?? "http://localhost:3001/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  onUnauthenticated: () => void;
}

/**
 * Browser-only fetch wrapper: attaches the in-memory access token, and on a
 * 401 refreshes (via the same-origin Route Handler, which owns the httpOnly
 * refresh cookie) through a single-flight queue so N concurrent 401s trigger
 * exactly one refresh, then retries each request once with the new token.
 */
export function createApiClient({ getAccessToken, setAccessToken, onUnauthenticated }: ApiClientOptions) {
  const refreshOnce = createRefreshQueue(async () => {
    const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    if (!res.ok) {
      setAccessToken(null);
      onUnauthenticated();
      throw new ApiError(res.status, "refresh failed");
    }
    const { accessToken } = (await res.json()) as { accessToken: string };
    setAccessToken(accessToken);
    return accessToken;
  });

  async function request(path: string, init: RequestInit, token: string | null): Promise<Response> {
    return fetch(`${BACKEND_HTTP_URL}${path}`, {
      ...init,
      headers: { ...init.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
  }

  async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res = await request(path, init, getAccessToken());

    if (res.status === 401) {
      const fresh = await refreshOnce();
      res = await request(path, init, fresh);
    }

    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return res.json() as Promise<T>;
  }

  // Exposed so SessionProvider's bootstrap (silent refresh on page load) goes
  // through the same single-flight queue as any 401-triggered refresh below -
  // two independent refresh calls racing on the same stale cookie would trip
  // the backend's reuse detection and revoke the whole session.
  return { apiFetch, refresh: refreshOnce };
}

export type ApiClient = ReturnType<typeof createApiClient>;
