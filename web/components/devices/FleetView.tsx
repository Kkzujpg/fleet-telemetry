"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../lib/session/session-context";
import { useSocket } from "../../lib/socket/socket-context";
import { readCache, saveCache } from "../../lib/offline/offline";
import type { DeviceListItem, ListDevicesResult } from "../../lib/types";
import type { PositionBroadcastPayload } from "../../../shared/contract";
import { FleetMap } from "../map/FleetMap";
import { DeviceList } from "./DeviceList";
import { AlertsPanel } from "../alerts/AlertsPanel";

const DEVICES_CACHE_KEY = "devices:list";

function applyPosition(device: DeviceListItem, payload: PositionBroadcastPayload): DeviceListItem {
  return {
    ...device,
    lastSeenAt: payload.recordedAt,
    connectivityStatus: "online",
    latestReading: {
      recordedAt: payload.recordedAt,
      lat: payload.lat,
      lng: payload.lng,
      speedKph: payload.speedKph,
      fuelLevelPct: device.latestReading?.fuelLevelPct ?? 0,
      fuelLiters: payload.fuelLiters,
      engineTempC: payload.engineTempC,
      odometerKm: device.latestReading?.odometerKm ?? 0,
    },
  };
}

export function FleetView() {
  const { apiFetch, user } = useSession();
  const { subscribeDevice } = useSocket();
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list");
  // Empieza vacío tanto en el render de servidor como en el de cliente para
  // que la hidratación coincida - localStorage no existe durante SSR, así
  // que poblar esto desde readCache() en el inicializador haría que el
  // primer render del cliente (con cache hit) no coincida con el markup
  // renderizado en servidor (siempre vacío). El snapshot cacheado se aplica
  // después del mount, en el efecto de abajo.
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const cached = readCache<DeviceListItem[]>(DEVICES_CACHE_KEY);
    if (cached) {
      setDevices(cached);
    }

    let cancelled = false;
    apiFetch<ListDevicesResult>("/devices?limit=100")
      .then((result) => {
        if (cancelled) return;
        setDevices(result.items);
        saveCache(DEVICES_CACHE_KEY, result.items);
      })
      .catch(() => {
        // Offline o backend inalcanzable - sigue mostrando el snapshot cacheado.
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  const handlePosition = useCallback((deviceId: string, payload: PositionBroadcastPayload) => {
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? applyPosition(d, payload) : d)));
  }, []);

  // La dependencia es el conjunto de ids, no `devices` en sí: cada tick de
  // posición reemplaza los objetos device (nuevas referencias) cada ~1s, y
  // resuscribirse tan seguido spamearía SUBSCRIBE_DEVICE/UNSUBSCRIBE_DEVICE
  // sin motivo.
  const deviceIds = devices.map((d) => d.id).join(",");
  useEffect(() => {
    const unsubscribes = devices.map((d) => subscribeDevice(d.id, (payload) => handlePosition(d.id, payload)));
    return () => unsubscribes.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIds, subscribeDevice, handlePosition]);

  function handleSelect(id: string) {
    setSelectedId(id);
    setMobileTab("map");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <style jsx>{`
        .fleet-mobile-tabs {
          display: none;
        }
        @media (max-width: 768px) {
          .fleet-body { flex-direction: column; }
          .fleet-sidebar {
            width: 100% !important;
            flex: 1;
            min-height: 0;
            border-right: none !important;
            border-bottom: 1px solid var(--border-subtle);
          }
          .fleet-map-pane {
            flex: 1;
            min-height: 0;
          }
          .fleet-sidebar[data-mobile-hidden="true"],
          .fleet-map-pane[data-mobile-hidden="true"] {
            display: none;
          }
          .fleet-mobile-tabs {
            display: flex;
            gap: 6px;
            padding: 8px 12px;
            border-bottom: 1px solid var(--border-subtle);
            background: var(--bg-elevated);
          }
          .fleet-mobile-tab {
            flex: 1;
            min-height: 44px;
            border-radius: var(--radius-sm);
            border: 1px solid var(--border-medium);
            background: var(--surface-2);
            color: var(--text-secondary);
            font-size: 13px;
            font-weight: 600;
          }
          .fleet-mobile-tab[data-active="true"] {
            background: var(--accent-soft);
            border-color: var(--accent-ring);
            color: var(--text-primary);
          }
        }
      `}</style>
      <div className="fleet-mobile-tabs">
        <button
          type="button"
          className="fleet-mobile-tab"
          data-active={mobileTab === "list"}
          onClick={() => setMobileTab("list")}
        >
          Lista
        </button>
        <button
          type="button"
          className="fleet-mobile-tab"
          data-active={mobileTab === "map"}
          onClick={() => setMobileTab("map")}
        >
          Mapa
        </button>
      </div>
      <div className="fleet-body" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside
          className="fleet-sidebar"
          data-mobile-hidden={mobileTab !== "list"}
          style={{
            width: 336,
            flexShrink: 0,
            overflowY: "auto",
            borderRight: "1px solid var(--border-subtle)",
            background: "var(--bg-elevated)",
          }}
        >
          <DeviceList devices={devices} selectedId={selectedId} onSelect={handleSelect} />
        </aside>
        <div className="fleet-map-pane" data-mobile-hidden={mobileTab !== "map"} style={{ flex: 1, minHeight: 0 }}>
          <FleetMap devices={devices} selectedDeviceId={selectedId} />
        </div>
      </div>
      {user?.role === "ADMIN" && <AlertsPanel devices={devices} />}
    </div>
  );
}
