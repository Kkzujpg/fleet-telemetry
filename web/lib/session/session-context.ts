import { createContext, useContext } from "react";
import type { UserProfile } from "../types";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface SessionContextValue {
  user: UserProfile | null;
  status: SessionStatus;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  /** Non-reactive accessor for the current in-memory access token (e.g. socket handshake auth). */
  getAccessToken: () => string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
