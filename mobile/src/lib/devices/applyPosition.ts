import type { DeviceListItem } from '../types';
import type { PositionBroadcastPayload } from '../../../../shared/contract';

/** Merges a live `position` broadcast onto a cached/fetched device, same shape as web/components/devices/FleetView.tsx. */
export function applyPosition(device: DeviceListItem, payload: PositionBroadcastPayload): DeviceListItem {
  return {
    ...device,
    lastSeenAt: payload.recordedAt,
    connectivityStatus: 'online',
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
