"use client";

import { useEffect, useState } from "react";
import { useSession } from "../../lib/session/session-context";
import { useSocket } from "../../lib/socket/socket-context";
import type { DeviceDetail } from "../../lib/types";
import { FleetMap } from "../map/FleetMap";
import { DeviceHistoryCharts } from "./DeviceHistoryCharts";
import { AlertTriangleIcon, ClockIcon, FuelIcon, GaugeIcon, ThermometerIcon } from "../icons";

const STATUS_TOKEN: Record<DeviceDetail["connectivityStatus"], { color: string; bg: string; label: string }> = {
  online: { color: "var(--status-online)", bg: "var(--status-online-soft)", label: "En línea" },
  stale: { color: "var(--status-stale)", bg: "var(--status-stale-soft)", label: "Señal débil" },
  offline: { color: "var(--status-offline)", bg: "var(--status-offline-soft)", label: "Sin señal" },
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  LOW_FUEL: "Combustible bajo",
};

function Readout({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div style={{ padding: "12px 14px", borderRight: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-tertiary)", marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 11.5 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span className="tabular" style={{ fontSize: 19, fontWeight: 620, fontFamily: "var(--font-mono)" }}>
          {value}
        </span>
        {unit && (
          <span className="tabular" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export function DeviceDetailView({ deviceId }: { deviceId: string }) {
  const { apiFetch } = useSession();
  const { subscribeDevice } = useSocket();
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DeviceDetail>(`/devices/${deviceId}`)
      .then((d) => !cancelled && setDevice(d))
      .catch(() => !cancelled && setError("No se pudo cargar el dispositivo."));
    return () => {
      cancelled = true;
    };
  }, [apiFetch, deviceId]);

  useEffect(() => {
    return subscribeDevice(deviceId, (payload) => {
      setDevice((prev) =>
        prev
          ? {
              ...prev,
              connectivityStatus: "online",
              lastSeenAt: payload.recordedAt,
              latestReading: {
                recordedAt: payload.recordedAt,
                lat: payload.lat,
                lng: payload.lng,
                speedKph: payload.speedKph,
                fuelLevelPct: prev.latestReading?.fuelLevelPct ?? 0,
                fuelLiters: payload.fuelLiters,
                engineTempC: payload.engineTempC,
                odometerKm: prev.latestReading?.odometerKm ?? 0,
              },
            }
          : prev,
      );
    });
  }, [deviceId, subscribeDevice]);

  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--status-critical)" }}>
        {error}
      </div>
    );
  }
  if (!device) {
    return <div style={{ padding: 24, color: "var(--text-secondary)" }}>Cargando…</div>;
  }

  const status = STATUS_TOKEN[device.connectivityStatus];
  const reading = device.latestReading;

  return (
    <div style={{ display: "flex", height: "100%", width: "100%" }}>
      <div
        style={{
          width: 380,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          background: "var(--bg-elevated)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ padding: "18px 18px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
            <h1 style={{ fontSize: 21, fontWeight: 650, letterSpacing: "-0.01em", margin: 0 }}>{device.plate}</h1>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11.5,
                fontWeight: 600,
                color: status.color,
                background: status.bg,
                padding: "3px 9px",
                borderRadius: "var(--radius-pill)",
              }}
            >
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: status.color }} />
              {status.label}
            </span>
          </div>
          <p
            className="tabular"
            style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", margin: 0 }}
          >
            {device.publicId}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            border: "1px solid var(--border-subtle)",
            borderLeft: "none",
            borderRight: "none",
            background: "var(--surface-1)",
          }}
        >
          <Readout icon={<GaugeIcon />} label="Velocidad" value={reading ? reading.speedKph.toFixed(0) : "—"} unit="km/h" />
          <Readout icon={<FuelIcon />} label="Combustible" value={reading ? reading.fuelLiters.toFixed(1) : "—"} unit="L" />
          <Readout
            icon={<ClockIcon />}
            label="Autonomía"
            value={device.autonomyKm !== null ? Math.round(device.autonomyKm).toString() : "—"}
            unit="km"
          />
          <Readout
            icon={<ThermometerIcon />}
            label="Motor"
            value={reading ? reading.engineTempC.toFixed(0) : "—"}
            unit="°C"
          />
        </div>

        {device.activeAlerts.length > 0 && (
          <div style={{ padding: "14px 18px 0" }}>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 650,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                margin: "0 0 8px",
              }}
            >
              Alertas activas
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {device.activeAlerts.map((alert) => {
                const critical = alert.severity === "CRITICAL";
                const color = critical ? "var(--status-critical)" : "var(--status-stale)";
                const bg = critical ? "var(--status-critical-soft)" : "var(--status-stale-soft)";
                return (
                  <div
                    key={alert.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      background: bg,
                      color,
                      fontSize: 12.5,
                    }}
                  >
                    <AlertTriangleIcon width={14} height={14} />
                    <span style={{ fontWeight: 600 }}>{ALERT_TYPE_LABEL[alert.type] ?? alert.type}</span>
                    {alert.distanceRemainingKm !== null && (
                      <span className="tabular" style={{ marginLeft: "auto", opacity: 0.85 }}>
                        {alert.distanceRemainingKm} km restantes
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ padding: "20px 18px 24px" }}>
          <h2
            style={{
              fontSize: 12,
              fontWeight: 650,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              margin: "0 0 12px",
            }}
          >
            Historial
          </h2>
          <DeviceHistoryCharts
            deviceId={device.id}
            tankCapacityL={device.tankCapacityL}
            currentFuelLiters={device.latestReading?.fuelLiters ?? 0}
            autonomyKm={device.autonomyKm}
          />
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <FleetMap devices={[device]} selectedDeviceId={device.id} />
      </div>
    </div>
  );
}
