"use client";

import { useEffect, useState } from "react";
import { useSession } from "../session/session-context";
import { useSocket } from "../socket/socket-context";
import { useOffline } from "../offline/offline-context";
import { enqueue } from "../offline/offline";
import { ApiError } from "../http/api-client";
import type { AlertView, ListAlertsResult } from "../types";
import type { AlertBroadcastPayload } from "../../../shared/contract";

/**
 * Active-alerts fetch + live WS push + offline-tolerant ack, shared by the
 * dashboard's alerts panel and the full /alerts page. The server only emits
 * alert events to the admin room (see SocketContextValue.onAlert), so this
 * is only meaningful for ADMIN sessions — callers gate rendering on role.
 */
export function useActiveAlerts() {
  const { apiFetch } = useSession();
  const { onAlert } = useSocket();
  const { isOnline } = useOffline();
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const [ackingId, setAckingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ListAlertsResult>("/alerts?status=active")
      .then((result) => {
        if (!cancelled) setAlerts(result.items);
      })
      .catch(() => {
        // Offline or backend unreachable - keep whatever is already shown.
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  useEffect(() => {
    return onAlert((payload: AlertBroadcastPayload) => {
      setAlerts((prev) => [
        {
          id: payload.id,
          deviceId: payload.deviceId,
          type: payload.type,
          severity: payload.severity,
          predictedEmptyAt: payload.predictedEmptyAt,
          distanceRemainingKm: payload.distanceRemainingKm,
          createdAt: payload.createdAt,
          acknowledgedAt: null,
          acknowledgedBy: null,
        },
        ...prev,
      ]);
    });
  }, [onAlert]);

  async function acknowledge(alertId: string) {
    setAckingId(alertId);
    const idempotencyKey = crypto.randomUUID();

    if (!isOnline) {
      enqueue({ kind: "alerts.ack", payload: { alertId, idempotencyKey } });
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledgedAt: new Date().toISOString() } : a)));
      setAckingId(null);
      return;
    }

    try {
      const updated = await apiFetch<AlertView>(`/alerts/${alertId}/ack`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
      });
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? updated : a)));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Someone else already acknowledged it - re-fetch to reconcile.
        const result = await apiFetch<ListAlertsResult>("/alerts?status=active");
        setAlerts(result.items);
      }
    } finally {
      setAckingId(null);
    }
  }

  return { alerts, ackingId, acknowledge, isOnline };
}
