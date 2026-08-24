import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../auth/session-context';
import { readCache, saveCache } from '../offline/offline';
import type { ListAlertsResult } from '../types';

const CACHE_KEY = 'alerts:list';
// Alerts close server-side as fuel recovers (e.g. after a sim restart refills
// the tank) - without a poll, the alerts strip/screen would only notice on
// pull-to-refresh or a full remount.
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

  // Silent background refresh - unlike `refresh`, a failed tick doesn't touch
  // `refreshing` (no spinner) or `error` (keep showing the last good list).
  const poll = useCallback(async () => {
    try {
      const result = await apiFetch<ListAlertsResult>('/alerts');
      setData(result);
      await saveCache(CACHE_KEY, result);
    } catch {
      // offline or backend hiccup - next tick tries again
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
