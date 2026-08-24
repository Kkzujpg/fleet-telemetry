import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../auth/session-context';
import { readCache, saveCache } from '../offline/offline';
import type { ListDevicesResult } from '../types';

const CACHE_KEY = 'devices:list';
// Campos como fuelLevelPct/connectivityStatus solo cambian del lado del
// servidor (el evento de socket `position` los omite a propósito, ver
// applyPosition.ts) - sin un poll esta lista solo se refrescaría con
// pull-to-refresh, quedando desactualizada apenas la telemetría en vivo
// empieza a moverse.
const POLL_MS = 5000;

/** Lista de devices cache-first: muestra el último snapshot bueno conocido de inmediato, luego revalida y hace poll para mantenerse fresca. */
export function useDevices() {
  const { apiFetch } = useSession();
  const [data, setData] = useState<ListDevicesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await apiFetch<ListDevicesResult>('/devices');
      setData(result);
      setError(null);
      await saveCache(CACHE_KEY, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'no se pudo actualizar');
    } finally {
      setRefreshing(false);
    }
  }, [apiFetch]);

  // Refresh silencioso en segundo plano - a diferencia de `refresh`, un tick
  // fallido no toca `refreshing` (sin spinner) ni `error` (sigue mostrando
  // la última lista buena).
  const poll = useCallback(async () => {
    try {
      const result = await apiFetch<ListDevicesResult>('/devices');
      setData(result);
      await saveCache(CACHE_KEY, result);
    } catch {
      // offline o falla puntual del backend - el próximo tick lo reintenta
    }
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCache<ListDevicesResult>(CACHE_KEY);
      if (!cancelled && cached) {
        setData(cached);
      }
      await refresh();
      if (!cancelled) {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  return { data, loading, refreshing, error, refresh };
}
