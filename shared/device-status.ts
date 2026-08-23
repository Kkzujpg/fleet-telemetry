export type DeviceConnectivityStatus = "online" | "stale" | "offline";

// A device pushes telemetry every few minutes (see backend seed: 5-minute
// interval). "online" tolerates one missed tick, "stale" a few more before
// we call it offline - wide enough to absorb normal jitter without flapping.
export const ONLINE_THRESHOLD_MS = 2 * 60_000;
export const STALE_THRESHOLD_MS = 10 * 60_000;

/** Pure so it can be reused identically for filtering (SQL cutoffs) and for display. */
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
