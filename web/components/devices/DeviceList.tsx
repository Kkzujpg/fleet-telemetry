"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { DeviceListItem } from "../../lib/types";
import { ChevronRightIcon } from "../icons";

const STATUS_TOKEN: Record<DeviceListItem["connectivityStatus"], { color: string; label: string }> = {
  online: { color: "var(--status-online)", label: "En línea" },
  stale: { color: "var(--status-stale)", label: "Señal débil" },
  offline: { color: "var(--status-offline)", label: "Sin señal" },
};

export interface DeviceListProps {
  devices: DeviceListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function DeviceList({ devices, selectedId, onSelect }: DeviceListProps) {
  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .device-card {
          background: var(--surface-1);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          transition: background 0.12s ease, border-color 0.12s ease;
          overflow: hidden;
        }
        .device-card:hover { border-color: var(--border-medium); }
        .device-card[data-selected="true"] {
          background: var(--accent-soft);
          border-color: var(--accent-ring);
        }
        .device-card-main {
          display: flex;
          align-items: center;
          gap: 9px;
          width: 100%;
          text-align: left;
          background: transparent;
          border: none;
          padding: 12px 14px;
        }
        .device-card-main:hover { background: var(--surface-2); }
        .device-card[data-selected="true"] .device-card-main:hover { background: transparent; }
        .device-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 14px;
          border-top: 1px solid var(--border-subtle);
        }
        .device-detail-link {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          font-size: 12px;
          font-weight: 550;
          color: var(--text-tertiary);
          padding: 2px;
          transition: color 0.12s ease, gap 0.12s ease;
        }
        .device-detail-link:hover { color: var(--accent-strong); gap: 5px; }
        @keyframes dot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--pulse-color); }
          70% { box-shadow: 0 0 0 5px transparent; }
        }
      `,
        }}
      />
      {devices.map((device) => {
        const status = STATUS_TOKEN[device.connectivityStatus];
        const selected = device.id === selectedId;
        return (
          <div key={device.id} className="device-card" data-selected={selected}>
            <button type="button" className="device-card-main" onClick={() => onSelect(device.id)} aria-pressed={selected}>
              <span
                aria-hidden
                title={status.label}
                style={
                  {
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: status.color,
                    flexShrink: 0,
                    "--pulse-color": status.color,
                    animation:
                      device.connectivityStatus === "online" ? "dot-pulse 2.2s ease-out infinite" : undefined,
                  } as CSSProperties
                }
              />
              <span style={{ fontWeight: 630, fontSize: 14.5, letterSpacing: "-0.005em", flex: 1, minWidth: 0 }}>
                {device.plate}
              </span>
              <span
                className="tabular"
                style={{
                  fontSize: 12.5,
                  fontWeight: 550,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  flexShrink: 0,
                }}
              >
                {device.latestReading ? `${device.latestReading.speedKph.toFixed(0)} km/h` : "—"}
              </span>
            </button>

            <div className="device-card-footer">
              <span
                className="tabular"
                style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}
              >
                {device.publicId}
              </span>
              <Link href={`/devices/${device.id}`} className="device-detail-link">
                Ver detalle
                <ChevronRightIcon width={11} height={11} />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
