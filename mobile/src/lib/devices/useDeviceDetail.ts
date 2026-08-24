import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../auth/session-context';
import { readCache, saveCache } from '../offline/offline';
import type { DeviceDetail } from '../types';

function cacheKey(id: string): string {
  return `devices:detail:${id}`;
}

export function useDeviceDetail(id: string) {
  const { apiFetch } = useSession();
  const [data, setData] = useState<DeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<DeviceDetail>(`/devices/${id}`);
      setData(result);
      setError(null);
      await saveCache(cacheKey(id), result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'no se pudo actualizar');
    }
  }, [apiFetch, id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCache<DeviceDetail>(cacheKey(id));
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
  }, [id]);

  return { data, loading, error, refresh };
}
