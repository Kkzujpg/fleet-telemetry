"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "../session/session-context";
import {
  HISTORY_RANGES,
  toHistoryChartPoints,
  type HistoryRangeKey,
  type HistoryChartPoint,
  type RawHistoryBucket,
} from "../../../shared/device-history";

export type HistoryStatus = "loading" | "success" | "empty" | "error";

export interface UseDeviceHistoryResult {
  status: HistoryStatus;
  points: HistoryChartPoint[];
  error: string | null;
  retry: () => void;
}

// Aislado para que la capa offline envuelva solo esta llamada (cache-read/write)
// sin tocar la máquina de estados de abajo - mismo patrón que readCache/saveCache
// en FleetView.
async function fetchHistoryBuckets(
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>,
  deviceId: string,
  range: HistoryRangeKey,
): Promise<RawHistoryBucket[]> {
  const { hours, bucket } = HISTORY_RANGES[range];
  const to = new Date();
  const from = new Date(to.getTime() - hours * 3_600_000);
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), bucket });
  return apiFetch<RawHistoryBucket[]>(`/devices/${deviceId}/history?${params}`);
}

export function useDeviceHistory(
  deviceId: string,
  range: HistoryRangeKey,
  tankCapacityL: number,
): UseDeviceHistoryResult {
  const { apiFetch } = useSession();
  const [status, setStatus] = useState<HistoryStatus>("loading");
  const [points, setPoints] = useState<HistoryChartPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let hasLoaded = false;
    const { bucketSeconds } = HISTORY_RANGES[range];

    async function load() {
      try {
        const buckets = await fetchHistoryBuckets(apiFetch, deviceId, range);
        if (cancelled) return;
        setPoints(toHistoryChartPoints(buckets, bucketSeconds, tankCapacityL));
        setStatus(buckets.length === 0 ? "empty" : "success");
        setError(null);
        hasLoaded = true;
      } catch {
        if (cancelled) return;
        // Un poll de fondo que falla no borra lo último bueno en pantalla -
        // solo el primer intento de este rango muestra error+retry.
        if (!hasLoaded) {
          setError("No se pudo cargar el historial.");
          setStatus("error");
        }
      }
    }

    setStatus("loading");
    setError(null);
    load();

    // Refetch al ritmo del bucket activo: la ventana [from,to) se recalcula
    // contra "ahora" en cada tick, así el gráfico avanza con datos ya
    // agregados en Postgres en vez de reimplementar date_bin en el cliente.
    const interval = setInterval(load, bucketSeconds * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiFetch, deviceId, range, tankCapacityL, attempt]);

  return { status, points, error, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}
