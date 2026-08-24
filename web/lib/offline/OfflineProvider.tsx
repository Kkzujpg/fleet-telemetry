"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../http/api-client";
import { useSession } from "../session/session-context";
import { flushQueue, QueuedAction } from "./offline";
import { OfflineContext } from "./offline-context";

async function replay(action: QueuedAction, apiFetch: ReturnType<typeof useSession>["apiFetch"]): Promise<boolean> {
  if (action.kind !== "alerts.ack") {
    return true; // unknown action kind - drop rather than retry forever
  }
  const { alertId, idempotencyKey } = action.payload as { alertId: string; idempotencyKey: string };
  try {
    await apiFetch(`/alerts/${alertId}/ack`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
    });
    return true;
  } catch (error) {
    // A conflict means it was already acknowledged (by this same idempotency
    // key, elsewhere) - that's a successful outcome, not a reason to retry.
    if (error instanceof ApiError && error.status === 409) {
      return true;
    }
    return false;
  }
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { apiFetch, status } = useSession();
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && status === "authenticated") {
      void flushQueue((action) => replay(action, apiFetch));
    }
  }, [isOnline, status, apiFetch]);

  const value = useMemo(() => ({ isOnline }), [isOnline]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
