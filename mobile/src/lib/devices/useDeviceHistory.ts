import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../auth/session-context';
import {
  HISTORY_RANGES,
  toHistoryChartPoints,
  type HistoryRangeKey,
  type HistoryChartPoint,
  type RawHistoryBucket,
} from '../../../../shared/device-history';

export type HistoryStatus = 'loading' | 'success' | 'empty' | 'error';

export interface UseDeviceHistoryResult {
  status: HistoryStatus;
  points: HistoryChartPoint[];
  error: string | null;
  retry: () => void;
}

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

/** Same polling/error semantics as web/lib/devices/useDeviceHistory.ts, on top of the mobile apiFetch. */
export function useDeviceHistory(
  deviceId: string,
  range: HistoryRangeKey,
  tankCapacityL: number,
): UseDeviceHistoryResult {
  const { apiFetch } = useSession();
  const [status, setStatus] = useState<HistoryStatus>('loading');
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
        setStatus(buckets.length === 0 ? 'empty' : 'success');
        setError(null);
        hasLoaded = true;
      } catch {
        if (cancelled) return;
        if (!hasLoaded) {
          setError('No se pudo cargar el historial.');
          setStatus('error');
        }
      }
    }

    // Resets to "loading" the instant deviceId/range/attempt changes, before
    // the async fetch below resolves - same pattern as
    // web/lib/devices/useDeviceHistory.ts, whose UI depends on this firing
    // synchronously so the spinner shows right away instead of the stale
    // previous range's chart.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('loading');
    setError(null);
    load();

    const interval = setInterval(load, bucketSeconds * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiFetch, deviceId, range, tankCapacityL, attempt]);

  return { status, points, error, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}
