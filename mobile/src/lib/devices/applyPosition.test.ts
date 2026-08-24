import { applyPosition } from './applyPosition';
import type { DeviceListItem } from '../types';
import type { PositionBroadcastPayload } from '../../../../shared/contract';

const DEVICE: DeviceListItem = {
  id: 'd1',
  publicId: 'DEV-0001',
  plate: 'ABC123',
  operationalStatus: 'ACTIVE',
  connectivityStatus: 'stale',
  lastSeenAt: '2026-08-23T10:00:00.000Z',
  latestReading: {
    recordedAt: '2026-08-23T10:00:00.000Z',
    lat: 4.6,
    lng: -74.1,
    speedKph: 30,
    fuelLevelPct: 55,
    fuelLiters: 33,
    engineTempC: 85,
    odometerKm: 1000,
  },
  autonomyKm: 120,
};

const PAYLOAD: PositionBroadcastPayload = {
  deviceId: 'd1',
  lat: 4.65,
  lng: -74.12,
  speedKph: 42,
  fuelLiters: 32,
  engineTempC: 87,
  recordedAt: '2026-08-23T10:00:05.000Z',
};

describe('applyPosition', () => {
  test('overlays lat/lng/speed/fuelLiters/engineTempC/recordedAt from the payload', () => {
    const result = applyPosition(DEVICE, PAYLOAD);
    expect(result.latestReading).toMatchObject({
      lat: 4.65,
      lng: -74.12,
      speedKph: 42,
      fuelLiters: 32,
      engineTempC: 87,
      recordedAt: '2026-08-23T10:00:05.000Z',
    });
  });

  test('carries fuelLevelPct and odometerKm over unchanged - the socket payload does not include them', () => {
    const result = applyPosition(DEVICE, PAYLOAD);
    expect(result.latestReading?.fuelLevelPct).toBe(55);
    expect(result.latestReading?.odometerKm).toBe(1000);
  });

  test('flips connectivityStatus to online and updates lastSeenAt - a live position is proof of life', () => {
    const result = applyPosition(DEVICE, PAYLOAD);
    expect(result.connectivityStatus).toBe('online');
    expect(result.lastSeenAt).toBe('2026-08-23T10:00:05.000Z');
  });

  test('defaults fuelLevelPct/odometerKm to 0 when the device had no prior reading', () => {
    const fresh: DeviceListItem = { ...DEVICE, latestReading: null };
    const result = applyPosition(fresh, PAYLOAD);
    expect(result.latestReading).toMatchObject({ fuelLevelPct: 0, odometerKm: 0 });
  });

  test('does not mutate the input device', () => {
    const before = JSON.stringify(DEVICE);
    applyPosition(DEVICE, PAYLOAD);
    expect(JSON.stringify(DEVICE)).toBe(before);
  });
});
