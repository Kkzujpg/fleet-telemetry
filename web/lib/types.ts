// Mirrors backend/src/devices/devices.service.ts and alerts.service.ts response
// shapes. Not imported directly from backend/src (each app is deployed and
// installed independently, see CLAUDE.md) - only shared/ crosses that boundary.

import type { DeviceConnectivityStatus } from "../../shared/device-status";

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

export type Role = "ADMIN" | "OPERATOR" | "VIEWER";

export interface UserProfile {
  id: string;
  email: string;
  role: Role;
}
