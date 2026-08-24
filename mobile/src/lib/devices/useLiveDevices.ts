import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../auth/session-context';
import { useSocket } from '../socket/socket-context';
import { readCache, saveCache } from '../offline/offline';
import { applyPosition } from './applyPosition';
import type { DeviceListItem, ListDevicesResult } from '../types';
import type { PositionBroadcastPayload } from '../../../../shared/contract';

const CACHE_KEY = 'devices:list';

/**
 * Same cache-first list as useDevices, plus live position merges via the
 * socket - for the map, where pull-to-refresh snapshots aren't enough and
 * markers need to move as readings arrive. Same merge logic as
 * web/components/devices/FleetView.tsx.
 */
export function useLiveDevices() {
  const { apiFetch } = useSession();
  const { subscribeDevice } = useSocket();
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCache<ListDevicesResult>(CACHE_KEY);
      if (!cancelled && cached) {
        setDevices(cached.items);
      }
      try {
        const result = await apiFetch<ListDevicesResult>('/devices?limit=100');
        if (!cancelled) {
          setDevices(result.items);
          await saveCache(CACHE_KEY, result);
        }
      } catch {
        // offline or backend unreachable - keep showing the cached snapshot
      }
      if (!cancelled) {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePosition = useCallback((deviceId: string, payload: PositionBroadcastPayload) => {
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? applyPosition(d, payload) : d)));
  }, []);

  // Dependency is the id set, not `devices` itself: a position tick replaces
  // device objects (new refs) every ~second, and re-subscribing that often
  // would spam SUBSCRIBE_DEVICE/UNSUBSCRIBE_DEVICE for no reason.
  const deviceIds = devices.map((d) => d.id).join(',');
  useEffect(() => {
    const unsubscribes = devices.map((d) => subscribeDevice(d.id, (payload) => handlePosition(d.id, payload)));
    return () => unsubscribes.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIds, subscribeDevice, handlePosition]);

  return { devices, loading };
}
