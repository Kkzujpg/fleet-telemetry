export interface FuelReading {
  timestamp: number;
  liters: number;
}

export type FuelAlertSeverity = "WARNING" | "CRITICAL";

export interface FuelAlertState {
  autonomyMinutes: number | null;
  now: number;
  lastAlertAt: number | null;
  alertActive: boolean;
}

export interface FuelAlertDecision {
  fire: boolean;
  close: boolean;
  severity: FuelAlertSeverity | null;
}

const WINDOW_MS = 15 * 60_000;
const MIN_READINGS = 3;
const REFUEL_JUMP_RATIO = 0.05;
const STOPPED_SLOPE_THRESHOLD = -0.05;
const ALERT_THRESHOLD_MIN = 60;
const ALERT_CRITICAL_MIN = 20;
const ALERT_DEDUPE_MS = 10 * 60_000;
const ALERT_CLOSE_MIN = 75;

function leastSquaresSlope(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  const xMean = points.reduce((sum, p) => sum + p.x, 0) / n;
  const yMean = points.reduce((sum, p) => sum + p.y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    const dx = p.x - xMean;
    numerator += dx * (p.y - yMean);
    denominator += dx * dx;
  }

  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

export function consumptionRate(readings: FuelReading[]): number | null {
  if (readings.length < MIN_READINGS) {
    return null;
  }

  const sorted = [...readings].sort((a, b) => a.timestamp - b.timestamp);
  const latestTs = sorted[sorted.length - 1].timestamp;
  const windowed = sorted.filter((r) => r.timestamp >= latestTs - WINDOW_MS);

  if (windowed.length < MIN_READINGS) {
    return null;
  }

  const t0 = windowed[0].timestamp;
  const points = windowed.map((r) => ({
    x: (r.timestamp - t0) / 3_600_000,
    y: r.liters,
  }));

  return leastSquaresSlope(points);
}

export function detectRefuel(
  readings: FuelReading[],
  tankCapacityL: number,
): FuelReading[] {
  const sorted = [...readings].sort((a, b) => a.timestamp - b.timestamp);
  const threshold = REFUEL_JUMP_RATIO * tankCapacityL;

  let splitIndex = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].liters - sorted[i - 1].liters > threshold) {
      splitIndex = i;
    }
  }

  return sorted.slice(splitIndex);
}

export function autonomyHours(
  currentLiters: number,
  slope: number | null,
): number | null {
  if (slope === null || slope > STOPPED_SLOPE_THRESHOLD) {
    return null;
  }

  return currentLiters / -slope;
}

export function shouldAlert(state: FuelAlertState): FuelAlertDecision {
  const { autonomyMinutes, now, lastAlertAt, alertActive } = state;

  if (autonomyMinutes === null) {
    return { fire: false, close: false, severity: null };
  }

  if (alertActive && autonomyMinutes > ALERT_CLOSE_MIN) {
    return { fire: false, close: true, severity: null };
  }

  if (autonomyMinutes >= ALERT_THRESHOLD_MIN) {
    return { fire: false, close: false, severity: null };
  }

  const severity: FuelAlertSeverity =
    autonomyMinutes < ALERT_CRITICAL_MIN ? "CRITICAL" : "WARNING";

  const recentlyAlerted =
    lastAlertAt !== null && now - lastAlertAt < ALERT_DEDUPE_MS;

  if (recentlyAlerted) {
    return { fire: false, close: false, severity: null };
  }

  return { fire: true, close: false, severity };
}
