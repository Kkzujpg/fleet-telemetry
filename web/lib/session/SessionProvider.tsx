"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createApiClient } from "../http/api-client";
import type { UserProfile } from "../types";
import { SessionContext, SessionStatus } from "./session-context";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const accessTokenRef = useRef<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const handleUnauthenticated = useCallback(() => {
    accessTokenRef.current = null;
    setUser(null);
    setStatus("unauthenticated");
    router.replace("/login");
  }, [router]);

  const apiClient = useMemo(
    () =>
      createApiClient({
        getAccessToken: () => accessTokenRef.current,
        setAccessToken: (token) => {
          accessTokenRef.current = token;
        },
        onUnauthenticated: handleUnauthenticated,
      }),
    [handleUnauthenticated],
  );

  // Access token lives only in memory, so a reload starts with none - bootstrap
  // one silent refresh (the httpOnly cookie survives the reload) before the
  // rest of the app tries to fetch anything. Goes through apiClient.refresh
  // (the same single-flight queue apiFetch uses on a 401), not a separate
  // fetch - two independent refreshers racing on the same stale, single-use
  // cookie would trip the backend's reuse detection and kill the session.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await apiClient.refresh();
        const me = await apiClient.apiFetch<UserProfile>("/auth/me");
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(res.status, payload?.message ?? "login failed");
    }
    accessTokenRef.current = payload.accessToken;
    setUser(payload.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: accessTokenRef.current ? { authorization: `Bearer ${accessTokenRef.current}` } : {},
    }).catch(() => undefined);
    handleUnauthenticated();
  }, [handleUnauthenticated]);

  const getAccessToken = useCallback(() => accessTokenRef.current, []);

  const value = useMemo(
    () => ({ user, status, apiFetch: apiClient.apiFetch, getAccessToken, login, logout }),
    [user, status, apiClient, getAccessToken, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
