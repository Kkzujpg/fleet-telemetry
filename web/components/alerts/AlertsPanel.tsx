"use client";

import Link from "next/link";
import { useActiveAlerts } from "../../lib/alerts/useActiveAlerts";
import type { DeviceListItem } from "../../lib/types";
import { AlertTriangleIcon, CheckIcon } from "../icons";

const TYPE_LABEL: Record<string, string> = {
  LOW_FUEL: "Combustible bajo",
};

function severityTokens(severity: string) {
  return severity === "CRITICAL"
    ? { fg: "var(--status-critical)", bg: "var(--status-critical-soft)" }
    : { fg: "var(--status-stale)", bg: "var(--status-stale-soft)" };
}

/** Anclado en el dashboard principal junto a la flota, no escondido detrás de /alerts. */
export function AlertsPanel({ devices }: { devices: DeviceListItem[] }) {
  const { alerts, ackingId, acknowledge } = useActiveAlerts();
  const plateByDeviceId = new Map(devices.map((d) => [d.id, d.plate]));
  const active = alerts.filter((a) => !a.acknowledgedAt);
  const hasActive = active.length > 0;

  // Siempre anclado en el dashboard - un estado tranquilo de "todo en orden"
  // igual confirma que el panel está ahí, en vez de desaparecer apenas no
  // hay nada mal.
  return (
    <div
      className="alerts-panel-root"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: "var(--bg-elevated)",
        borderTop: "1px solid var(--border-subtle)",
        flexShrink: 0,
      }}
    >
      <style jsx>{`
        @media (max-width: 640px) {
          .alerts-panel-chips {
            display: none !important;
          }
        }
      `}</style>
      <span
        style={{
          fontSize: 12,
          fontWeight: 650,
          color: hasActive ? "var(--text-secondary)" : "var(--text-tertiary)",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {hasActive ? (
          <AlertTriangleIcon width={14} height={14} style={{ color: "var(--status-stale)" }} />
        ) : (
          <CheckIcon width={13} height={13} style={{ color: "var(--status-online)" }} />
        )}
        Alertas activas
        {hasActive && (
          <span className="tabular" style={{ color: "var(--text-tertiary)" }}>
            {active.length}
          </span>
        )}
      </span>

      {!hasActive && (
        <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Sin alertas — toda la flota en orden</span>
      )}

      <div className="alerts-panel-chips" style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        {active.map((alert) => {
          const tokens = severityTokens(alert.severity);
          return (
            <div
              key={alert.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
                padding: "5px 6px 5px 10px",
                borderRadius: "var(--radius-pill)",
                background: tokens.bg,
                color: tokens.fg,
                fontSize: 12.5,
              }}
            >
              <span style={{ fontWeight: 650 }}>{plateByDeviceId.get(alert.deviceId) ?? "—"}</span>
              <span style={{ opacity: 0.85 }}>{TYPE_LABEL[alert.type] ?? alert.type}</span>
              {alert.distanceRemainingKm !== null && (
                <span className="tabular" style={{ opacity: 0.85 }}>
                  · {alert.distanceRemainingKm} km
                </span>
              )}
              <button
                type="button"
                title="Reconocer"
                disabled={ackingId === alert.id}
                onClick={() => acknowledge(alert.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  border: "none",
                  background: "oklch(100% 0 0 / 0.14)",
                  color: "inherit",
                  opacity: ackingId === alert.id ? 0.5 : 1,
                }}
              >
                <CheckIcon width={12} height={12} />
              </button>
            </div>
          );
        })}
      </div>

      <Link
        href="/alerts"
        style={{
          marginLeft: "auto",
          flexShrink: 0,
          fontSize: 12.5,
          fontWeight: 550,
          color: "var(--text-secondary)",
        }}
      >
        Ver todas →
      </Link>
    </div>
  );
}
