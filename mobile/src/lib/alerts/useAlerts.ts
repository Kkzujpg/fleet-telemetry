import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../auth/session-context';
import { readCache, saveCache } from '../offline/offline';
import type { ListAlertsResult } from '../types';

const CACHE_KEY = 'alerts:list';
// Las alertas se cierran del lado del servidor cuando el combustible se
// recupera (ej: tras reiniciar el simulador y rellenar el tanque) - sin un
// poll, el strip/pantalla de alertas solo se enteraría con pull-to-refresh o
// un remount completo.
const POLL_MS = 5000;

export function useAlerts() {
  const { apiFetch } = useSession();
  const [data, setData] = useState<ListAlertsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await apiFetch<ListAlertsResult>('/alerts');
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
      const result = await apiFetch<ListAlertsResult>('/alerts');
      setData(result);
      await saveCache(CACHE_KEY, result);
    } catch {
      // offline o falla puntual del backend - el próximo tick lo reintenta
    }
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCache<ListAlertsResult>(CACHE_KEY);
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
