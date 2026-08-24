"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { autonomyThresholdLiters, type HistoryRangeKey } from "../../../shared/device-history";
import { ALERT_THRESHOLD_KM } from "../../../shared/fuel";
import { useDeviceHistory } from "../../lib/devices/useDeviceHistory";

const RANGE_LABELS: Record<HistoryRangeKey, string> = {
  "1h": "1 hora",
  "6h": "6 horas",
  "24h": "24 horas",
};
const RANGE_KEYS: HistoryRangeKey[] = ["1h", "6h", "24h"];

function formatAxisTime(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTooltipTime(t: number): string {
  return new Date(t).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

export interface DeviceHistoryChartsProps {
  deviceId: string;
  tankCapacityL: number;
  currentFuelLiters: number;
  autonomyKm: number | null;
}

export function DeviceHistoryCharts({
  deviceId,
  tankCapacityL,
  currentFuelLiters,
  autonomyKm,
}: DeviceHistoryChartsProps) {
  const [range, setRange] = useState<HistoryRangeKey>("1h");
  const { status, points, error, retry } = useDeviceHistory(deviceId, range, tankCapacityL);
  const thresholdLiters = useMemo(
    () => autonomyThresholdLiters(currentFuelLiters, autonomyKm, ALERT_THRESHOLD_KM),
    [currentFuelLiters, autonomyKm],
  );

  return (
    <div className="device-history">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .device-history {
          --history-surface: var(--surface-1);
          --history-text: var(--text-primary);
          --history-muted: var(--text-tertiary);
          --history-grid: var(--border-subtle);
          --history-axis: var(--border-medium);
          --history-series-1: var(--accent);
          --history-series-2: oklch(74% 0.15 40);
          --history-warning: var(--status-stale);
        }
        .device-history-range { display: flex; gap: 6px; }
        .device-history-range button {
          background: var(--surface-1);
          border: 1px solid var(--border-medium);
          color: var(--text-secondary);
          font-size: 12.5px;
          font-weight: 550;
          padding: 5px 11px;
          border-radius: var(--radius-pill);
          transition: border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
        }
        .device-history-range button:hover { border-color: var(--border-strong); }
        .device-history-range button[aria-pressed="true"] {
          color: var(--bg);
          background: var(--accent);
          border-color: var(--accent);
        }
      `,
        }}
      />

      <div className="device-history-range" style={{ marginBottom: 14 }}>
        {RANGE_KEYS.map((key) => (
          <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>
            {RANGE_LABELS[key]}
          </button>
        ))}
      </div>

      {status === "loading" && <p style={{ color: "var(--history-muted)" }}>Cargando historial…</p>}

      {status === "error" && (
        <div>
          <p style={{ color: "var(--history-warning)" }}>{error}</p>
          <button type="button" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}

      {status === "empty" && (
        <p style={{ color: "var(--history-muted)" }}>Este vehículo no tiene lecturas en este rango.</p>
      )}

      {status === "success" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <h3 style={{ fontSize: 13, color: "var(--history-text)", marginBottom: 4 }}>Combustible (L)</h3>
            <div
              style={{
                background: "var(--history-surface)",
                borderRadius: 6,
                padding: 8,
              }}
            >
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={points} syncId="device-history" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--history-grid)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={formatAxisTime}
                    stroke="var(--history-axis)"
                    tick={{ fill: "var(--history-muted)", fontSize: 11 }}
                  />
                  <YAxis
                    width={48}
                    stroke="var(--history-axis)"
                    tick={{ fill: "var(--history-muted)", fontSize: 11 }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}L`}
                    domain={[0, (dataMax: number) => Math.max(dataMax, thresholdLiters ?? 0)]}
                  />
                  <Tooltip
                    labelFormatter={(label) => formatTooltipTime(Number(label))}
                    formatter={(value) => [`${Number(value).toFixed(1)} L`, "Combustible"]}
                    contentStyle={{ background: "var(--history-surface)", border: "1px solid var(--history-grid)" }}
                    labelStyle={{ color: "var(--history-text)" }}
                  />
                  <Area
                    type="linear"
                    dataKey="fuelLiters"
                    name="Combustible"
                    stroke="var(--history-series-1)"
                    fill="var(--history-series-1)"
                    fillOpacity={0.25}
                    strokeWidth={2}
                    connectNulls={false}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {thresholdLiters !== null && (
                    <ReferenceLine
                      y={thresholdLiters}
                      stroke="var(--history-warning)"
                      strokeDasharray="6 4"
                      label={{
                        value: `Umbral ${ALERT_THRESHOLD_KM}km de autonomía`,
                        position: "insideTopLeft",
                        fill: "var(--history-warning)",
                        fontSize: 11,
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 13, color: "var(--history-text)", marginBottom: 4 }}>Velocidad (km/h)</h3>
            <div
              style={{
                background: "var(--history-surface)",
                borderRadius: 6,
                padding: 8,
              }}
            >
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={points} syncId="device-history" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--history-grid)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={formatAxisTime}
                    stroke="var(--history-axis)"
                    tick={{ fill: "var(--history-muted)", fontSize: 11 }}
                  />
                  <YAxis
                    width={48}
                    stroke="var(--history-axis)"
                    tick={{ fill: "var(--history-muted)", fontSize: 11 }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}`}
                    domain={[0, "dataMax"]}
                  />
                  <Tooltip
                    labelFormatter={(label) => formatTooltipTime(Number(label))}
                    formatter={(value, name) => [`${Number(value).toFixed(0)} km/h`, String(name)]}
                    contentStyle={{ background: "var(--history-surface)", border: "1px solid var(--history-grid)" }}
                    labelStyle={{ color: "var(--history-text)" }}
                  />
                  <Legend wrapperStyle={{ color: "var(--history-text)", fontSize: 12 }} />
                  <Line
                    type="linear"
                    dataKey="avgSpeedKph"
                    name="Promedio"
                    stroke="var(--history-series-1)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="maxSpeedKph"
                    name="Máximo"
                    stroke="var(--history-series-2)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
