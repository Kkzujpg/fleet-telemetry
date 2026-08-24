"use client";

import { useEffect, useState } from "react";
import { useSession } from "../../lib/session/session-context";
import { useOffline } from "../../lib/offline/offline-context";
import { useActiveAlerts } from "../../lib/alerts/useActiveAlerts";
import type { ListDevicesResult } from "../../lib/types";
import { AlertTriangleIcon, CheckIcon, ClockIcon } from "../icons";

const TYPE_LABEL: Record<string, string> = {
  LOW_FUEL: "Combustible bajo",
};

function severityTokens(severity: string) {
  return severity === "CRITICAL"
    ? { fg: "var(--status-critical)", bg: "var(--status-critical-soft)", label: "Crítica" }
    : { fg: "var(--status-stale)", bg: "var(--status-stale-soft)", label: "Aviso" };
}

export function AlertsList() {
  const { apiFetch } = useSession();
  const { isOnline } = useOffline();
  const { alerts, ackingId, acknowledge } = useActiveAlerts();
  const [plateByDeviceId, setPlateByDeviceId] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    apiFetch<ListDevicesResult>("/devices?limit=100")
      .then((result) => setPlateByDeviceId(new Map(result.items.map((d) => [d.id, d.plate]))))
      .catch(() => {});
  }, [apiFetch]);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 880, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 650, letterSpacing: "-0.01em", margin: 0 }}>Alertas</h1>
        <span className="tabular" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          {alerts.filter((a) => !a.acknowledgedAt).length} activas
        </span>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "0 0 20px" }}>
        Fleet-wide, en tiempo real. Reconocer una alerta la marca como atendida para todo el equipo.
      </p>

      {!isOnline && (
        <div
          style={{
            padding: "9px 12px",
            marginBottom: 16,
            borderRadius: "var(--radius-sm)",
            background: "var(--status-stale-soft)",
            color: "var(--status-stale)",
            fontSize: 13,
          }}
        >
          Sin conexión — las confirmaciones se enviarán al reconectar.
        </div>
      )}

      {alerts.length === 0 ? (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "var(--text-tertiary)",
            border: "1px dashed var(--border-medium)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          Sin alertas registradas.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((alert) => {
            const tokens = severityTokens(alert.severity);
            const acked = Boolean(alert.acknowledgedAt);
            return (
              <div
                key={alert.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "13px 16px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  opacity: acked ? 0.6 : 1,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: tokens.bg,
                    color: tokens.fg,
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangleIcon width={16} height={16} />
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 620, fontSize: 14.5 }}>
                      {plateByDeviceId.get(alert.deviceId) ?? "Vehículo"}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {TYPE_LABEL[alert.type] ?? alert.type}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 650,
                        color: tokens.fg,
                        background: tokens.bg,
                        padding: "2px 8px",
                        borderRadius: "var(--radius-pill)",
                      }}
                    >
                      {tokens.label}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      marginTop: 3,
                    }}
                  >
                    <ClockIcon width={11} height={11} />
                    {new Date(alert.createdAt).toLocaleString()}
                    {alert.distanceRemainingKm !== null && !acked && (
                      <span className="tabular">· {alert.distanceRemainingKm} km restantes</span>
                    )}
                  </div>
                </div>

                {acked ? (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12.5,
                      color: "var(--status-online)",
                      flexShrink: 0,
                    }}
                  >
                    <CheckIcon width={13} height={13} />
                    Reconocida
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={ackingId === alert.id}
                    onClick={() => acknowledge(alert.id)}
                    style={{
                      flexShrink: 0,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--bg)",
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      padding: "7px 13px",
                      opacity: ackingId === alert.id ? 0.6 : 1,
                    }}
                  >
                    Reconocer
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
