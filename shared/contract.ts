export const WS_EVENTS = {
  SUBSCRIBE_DEVICE: "subscribe:device",
  UNSUBSCRIBE_DEVICE: "unsubscribe:device",
  POSITION: "position",
  ALERT: "alert",
} as const;

export const ADMIN_ROOM = "role:admin";

export function deviceRoom(deviceId: string): string {
  return `device:${deviceId}`;
}

export interface SubscribeDevicePayload {
  deviceId: string;
}

export interface PositionBroadcastPayload {
  deviceId: string;
  lat: number;
  lng: number;
  speedKph: number;
  fuelLiters: number;
  engineTempC: number;
  recordedAt: string;
}

export interface AlertBroadcastPayload {
  id: string;
  deviceId: string;
  type: string;
  severity: string;
  predictedEmptyAt: string | null;
  distanceRemainingKm: number | null;
  createdAt: string;
}
