export type DeviceConnectivityStatus = "online" | "stale" | "offline";

// Un device envía telemetría cada pocos minutos (ver backend seed: intervalo
// de 5 minutos). "online" tolera un tick perdido, "stale" algunos más antes
// de considerarlo offline - margen amplio para absorber jitter normal sin
// parpadear entre estados.
export const ONLINE_THRESHOLD_MS = 2 * 60_000;
export const STALE_THRESHOLD_MS = 10 * 60_000;

/** Pura para poder reusarla idéntica tanto en filtrado (cortes SQL) como en visualización. */
export function deriveDeviceStatus(
  lastSeenAt: Date | null,
  now: Date,
): DeviceConnectivityStatus {
  if (!lastSeenAt) {
    return "offline";
  }

  const ageMs = now.getTime() - lastSeenAt.getTime();
  if (ageMs <= ONLINE_THRESHOLD_MS) {
    return "online";
  }
  if (ageMs <= STALE_THRESHOLD_MS) {
    return "stale";
  }
  return "offline";
}
