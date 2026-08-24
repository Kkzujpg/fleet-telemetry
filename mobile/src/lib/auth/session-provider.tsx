import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ApiError, BACKEND_HTTP_URL, createApiClient } from './api-client';
import { getStoredRefreshToken, setStoredRefreshToken } from './secure-store';
import type { UserProfile } from '../types';
import { SessionContext, SessionStatus } from './session-context';

interface MobileLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
  message?: string;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const accessTokenRef = useRef<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  const handleUnauthenticated = useCallback(() => {
    accessTokenRef.current = null;
    setUser(null);
    setStatus('unauthenticated');
    router.replace('/login');
  }, [router]);

  const apiClient = useMemo(
    () =>
      // accessTokenRef solo se lee/escribe dentro de estos callbacks cuando
      // createApiClient los invoca después (en un 401 o un refresh
      // explícito) - nunca de forma sincrónica durante esta construcción.
      // Mismo patrón de ref-como-caja-mutable que
      // web/lib/session/SessionProvider.tsx.
      // eslint-disable-next-line react-hooks/refs
      createApiClient({
        getAccessToken: () => accessTokenRef.current,
        setAccessToken: (token) => {
          accessTokenRef.current = token;
        },
        getRefreshToken: getStoredRefreshToken,
        setRefreshToken: setStoredRefreshToken,
        onUnauthenticated: handleUnauthenticated,
      }),
    [handleUnauthenticated],
  );

  // Tanto el access token (en memoria) como el refresh token (secure store,
  // pero solo legible de forma async) empiezan desconocidos en un lanzamiento
  // en frío de la app - se hace un refresh silencioso inicial antes de que
  // cualquier otra cosa intente pedir datos. Pasa por apiClient.refresh (la
  // misma cola single-flight que usa apiFetch en un 401), no una llamada
  // separada - dos refreshers independientes compitiendo por el mismo token
  // stale y de un solo uso dispararían la detección de reuso del backend.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await apiClient.refresh();
        const me = await apiClient.apiFetch<UserProfile>('/auth/me');
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        if (!cancelled) setStatus('unauthenticated');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BACKEND_HTTP_URL}/auth/mobile/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const payload = (await res.json().catch(() => null)) as MobileLoginResponse | null;
    if (!res.ok || !payload) {
      throw new ApiError(res.status, payload?.message ?? 'login failed');
    }
    accessTokenRef.current = payload.accessToken;
    await setStoredRefreshToken(payload.refreshToken);
    setUser(payload.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = await getStoredRefreshToken();
    if (refreshToken && accessTokenRef.current) {
      await fetch(`${BACKEND_HTTP_URL}/auth/mobile/logout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessTokenRef.current}`,
        },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    await setStoredRefreshToken(null);
    handleUnauthenticated();
  }, [handleUnauthenticated]);

  const getAccessToken = useCallback(() => accessTokenRef.current, []);

  const value = useMemo(
    () => ({ user, status, apiFetch: apiClient.apiFetch, getAccessToken, login, logout }),
    [user, status, apiClient, getAccessToken, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
