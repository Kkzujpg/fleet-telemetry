import { createRefreshQueue } from './refresh-queue';

export const BACKEND_HTTP_URL =
  process.env.EXPO_PUBLIC_BACKEND_HTTP_URL ?? 'http://localhost:3001/api/v1';

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
  // Unlike web (httpOnly cookie, invisible to JS but sent automatically by
  // the browser), mobile has no cookie jar: the refresh token has to be read
  // from and written back to expo-secure-store by hand around every refresh.
  getRefreshToken: () => Promise<string | null>;
  setRefreshToken: (token: string | null) => Promise<void>;
  onUnauthenticated: () => void;
}

interface RefreshResponseBody {
  accessToken: string;
  refreshToken: string;
}

/**
 * Fetch wrapper: attaches the in-memory access token, and on a 401 refreshes
 * through POST /auth/mobile/refresh (body-based, see backend/src/auth/auth.controller.ts)
 * via a single-flight queue so N concurrent 401s trigger exactly one refresh,
 * then retries each request once with the new token.
 */
export function createApiClient({
  getAccessToken,
  setAccessToken,
  getRefreshToken,
  setRefreshToken,
  onUnauthenticated,
}: ApiClientOptions) {
  const refreshOnce = createRefreshQueue(async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      setAccessToken(null);
      onUnauthenticated();
      throw new ApiError(401, 'no refresh token stored');
    }

    const res = await fetch(`${BACKEND_HTTP_URL}/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      setAccessToken(null);
      await setRefreshToken(null);
      onUnauthenticated();
      throw new ApiError(res.status, 'refresh failed');
    }

    const body = (await res.json()) as RefreshResponseBody;
    setAccessToken(body.accessToken);
    await setRefreshToken(body.refreshToken);
    return body.accessToken;
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

  // Exposed so SessionProvider's bootstrap (silent refresh on app launch) goes
  // through the same single-flight queue as any 401-triggered refresh below -
  // two independent refresh calls racing on the same stale stored token would
  // trip the backend's reuse detection and revoke the whole session.
  return { apiFetch, refresh: refreshOnce };
}

export type ApiClient = ReturnType<typeof createApiClient>;
