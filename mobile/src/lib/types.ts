// Refleja las formas de respuesta de backend/src/devices/devices.service.ts y
// alerts.service.ts, igual que web/lib/types.ts. No se importa directo desde
// backend/src (cada app se despliega e instala de forma independiente, ver
// CLAUDE.md) - solo shared/ cruza esa frontera.

import type { DeviceConnectivityStatus } from '../../../shared/device-status';

export interface LatestReadingView {
  recordedAt: string;
  lat: number;
  lng: number;
  speedKph: number;
  fuelLevelPct: number;
  fuelLiters: number;
  engineTempC: number;
  odometerKm: number;
}

export interface ActiveAlertView {
  id: string;
  type: string;
  severity: string;
  predictedEmptyAt: string | null;
  distanceRemainingKm: number | null;
  createdAt: string;
}

export interface DeviceListItem {
  id: string;
  publicId: string;
  plate: string;
  operationalStatus: string;
  connectivityStatus: DeviceConnectivityStatus;
  lastSeenAt: string | null;
  latestReading: LatestReadingView | null;
  autonomyKm: number | null;
}

export interface DeviceDetail extends DeviceListItem {
  tankCapacityL: number;
  activeAlerts: ActiveAlertView[];
}

export interface ListDevicesResult {
  items: DeviceListItem[];
  nextCursor: string | null;
}

export interface AlertView {
  id: string;
  deviceId: string;
  type: string;
  severity: string;
  predictedEmptyAt: string | null;
  distanceRemainingKm: number | null;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface ListAlertsResult {
  items: AlertView[];
  nextCursor: string | null;
}

export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER';

export interface UserProfile {
  id: string;
  email: string;
  role: Role;
}
