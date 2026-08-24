import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../auth/session-context';
import { readCache, saveCache } from '../offline/offline';
import type { ListDevicesResult } from '../types';

const CACHE_KEY = 'devices:list';
// Fields like fuelLevelPct/connectivityStatus only change server-side (the
// `position` socket event deliberately omits them, see applyPosition.ts) -
// without a poll this list would only ever refresh on pull-to-refresh, going
// stale the moment live telemetry starts moving.
const POLL_MS = 5000;

/** Cache-first device list: shows the last-known-good snapshot immediately, then revalidates and polls for freshness. */
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

  // Silent background refresh - unlike `refresh`, a failed tick doesn't touch
  // `refreshing` (no spinner) or `error` (keep showing the last good list).
  const poll = useCallback(async () => {
    try {
      const result = await apiFetch<ListDevicesResult>('/devices');
      setData(result);
      await saveCache(CACHE_KEY, result);
    } catch {
      // offline or backend hiccup - next tick tries again
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
