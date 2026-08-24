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
      // accessTokenRef is only read/written inside these callbacks when
      // createApiClient later invokes them (on a 401 or an explicit refresh)
      // - never synchronously during this construction. Same ref-as-mutable-
      // box pattern as web/lib/session/SessionProvider.tsx.
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

  // Both the access token (in memory) and the refresh token (secure store,
  // but only readable async) start out unknown on a cold app launch -
  // bootstrap one silent refresh before anything else tries to fetch. Goes
  // through apiClient.refresh (the same single-flight queue apiFetch uses on
  // a 401), not a separate call - two independent refreshers racing on the
  // same stale, single-use token would trip the backend's reuse detection.
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
