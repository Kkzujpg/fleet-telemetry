import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../auth/session-context';
import { useSocket } from '../socket/socket-context';
import { readCache, saveCache } from '../offline/offline';
import { applyPosition } from './applyPosition';
import type { DeviceListItem, ListDevicesResult } from '../types';
import type { PositionBroadcastPayload } from '../../../../shared/contract';

const CACHE_KEY = 'devices:list';

/**
 * Misma lista cache-first que useDevices, más el merge de posiciones en vivo
 * vía el socket - para el mapa, donde los snapshots de pull-to-refresh no
 * alcanzan y los markers necesitan moverse a medida que llegan lecturas.
 * Misma lógica de merge que web/components/devices/FleetView.tsx.
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
        // offline o backend inalcanzable - sigue mostrando el snapshot cacheado
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

  // La dependencia es el conjunto de ids, no `devices` en sí: cada tick de
  // posición reemplaza los objetos device (nuevas referencias) cada ~1s, y
  // resuscribirse tan seguido spamearía SUBSCRIBE_DEVICE/UNSUBSCRIBE_DEVICE
  // sin motivo.
  const deviceIds = devices.map((d) => d.id).join(',');
  useEffect(() => {
    const unsubscribes = devices.map((d) => subscribeDevice(d.id, (payload) => handlePosition(d.id, payload)));
    return () => unsubscribes.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIds, subscribeDevice, handlePosition]);

  return { devices, loading };
}
