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
 * Wrapper de fetch solo para el navegador: adjunta el access token en
 * memoria, y ante un 401 refresca (vía el Route Handler del mismo origen,
 * dueño de la refresh cookie httpOnly) a través de una cola single-flight
 * para que N 401 concurrentes disparen exactamente un refresh, y luego
 * reintenta cada request una vez con el token nuevo.
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

  // Se expone para que el bootstrap de SessionProvider (refresh silencioso al
  // cargar la página) pase por la misma cola single-flight que cualquier
  // refresh disparado por un 401 más abajo - dos llamadas de refresh
  // independientes compitiendo por la misma cookie stale dispararían la
  // detección de reuso del backend y revocarían toda la sesión.
  return { apiFetch, refresh: refreshOnce };
}

export type ApiClient = ReturnType<typeof createApiClient>;
