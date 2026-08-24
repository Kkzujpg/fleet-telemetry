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
  // A diferencia de web (cookie httpOnly, invisible a JS pero enviada
  // automáticamente por el navegador), mobile no tiene cookie jar: el
  // refresh token hay que leerlo y volver a escribirlo a mano en
  // expo-secure-store en cada refresh.
  getRefreshToken: () => Promise<string | null>;
  setRefreshToken: (token: string | null) => Promise<void>;
  onUnauthenticated: () => void;
}

interface RefreshResponseBody {
  accessToken: string;
  refreshToken: string;
}

/**
 * Wrapper de fetch: adjunta el access token en memoria, y ante un 401
 * refresca vía POST /auth/mobile/refresh (basado en body, ver
 * backend/src/auth/auth.controller.ts) a través de una cola single-flight
 * para que N 401 concurrentes disparen exactamente un refresh, y luego
 * reintenta cada request una vez con el token nuevo.
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

  // Se expone para que el bootstrap de SessionProvider (refresh silencioso al
  // lanzar la app) pase por la misma cola single-flight que cualquier
  // refresh disparado por un 401 más abajo - dos llamadas de refresh
  // independientes compitiendo por el mismo token stale guardado dispararían
  // la detección de reuso del backend y revocarían toda la sesión.
  return { apiFetch, refresh: refreshOnce };
}

export type ApiClient = ReturnType<typeof createApiClient>;
