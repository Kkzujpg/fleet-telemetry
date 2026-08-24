export interface FuelReading {
  timestamp: number;
  liters: number;
  odometerKm: number;
}

export type FuelAlertSeverity = "WARNING" | "CRITICAL";

export interface FuelAlertState {
  autonomyKm: number | null;
  now: number;
  lastAlertAt: number | null;
  alertActive: boolean;
}

export interface FuelAlertDecision {
  fire: boolean;
  close: boolean;
  severity: FuelAlertSeverity | null;
}

/** Compartida por la evaluación de alertas y el listado de devices, para que ambos lean la misma ventana móvil de lecturas. */
export const AUTONOMY_WINDOW_MS = 15 * 60_000;
const WINDOW_MS = AUTONOMY_WINDOW_MS;
const MIN_READINGS = 3;
const REFUEL_JUMP_RATIO = 0.05;
// El odómetro de un vehículo detenido/en ralentí apenas se mueve, así que
// solo el ruido puede inclinar la regresión levemente a negativo - este piso
// debe quedar bien por debajo de cualquier consumo real plausible (autos
// reales rondan ~0.05-0.10 L/km) para que un vehículo genuinamente económico
// nunca se confunda con uno "detenido".
const STOPPED_SLOPE_KM_THRESHOLD = -0.005;
// Por debajo de esta distancia en la ventana, la dispersión en x de la
// regresión es demasiado pequeña para confiar en ella - el jitter de
// GPS/odómetro estando estacionado puede producir una pendiente muy
// inestable (y a menudo con apariencia pronunciada).
const MIN_WINDOW_DISTANCE_KM = 0.3;
export const ALERT_THRESHOLD_KM = 50;
const ALERT_CRITICAL_KM = 15;
const ALERT_DEDUPE_MS = 10 * 60_000;
const ALERT_CLOSE_KM = 65;

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

/** Recorte de ventana móvil sobre `sorted`, sin lecturas más viejas que WINDOW_MS respecto a la última. */
function windowReadings(sorted: FuelReading[]): FuelReading[] {
  if (sorted.length === 0) {
    return sorted;
  }
  const latestTs = sorted[sorted.length - 1].timestamp;
  return sorted.filter((r) => r.timestamp >= latestTs - WINDOW_MS);
}

/** Tasa de consumo en L/km (negativo = consumiendo), por regresión de mínimos cuadrados de litros contra km de odómetro. */
export function consumptionRatePerKm(readings: FuelReading[]): number | null {
  if (readings.length < MIN_READINGS) {
    return null;
  }

  const sorted = [...readings].sort((a, b) => a.timestamp - b.timestamp);
  const windowed = windowReadings(sorted);

  if (windowed.length < MIN_READINGS) {
    return null;
  }

  const distanceKm = windowed[windowed.length - 1].odometerKm - windowed[0].odometerKm;
  if (distanceKm < MIN_WINDOW_DISTANCE_KM) {
    return null;
  }

  const km0 = windowed[0].odometerKm;
  const points = windowed.map((r) => ({
    x: r.odometerKm - km0,
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

export function autonomyKm(
  currentLiters: number,
  slopeLPerKm: number | null,
): number | null {
  if (slopeLPerKm === null || slopeLPerKm > STOPPED_SLOPE_KM_THRESHOLD) {
    return null;
  }

  return currentLiters / -slopeLPerKm;
}

/**
 * Km de autonomía restante, a partir de las lecturas de combustible de un
 * device ordenadas de más antigua a más reciente. Envuelve detectRefuel +
 * consumptionRatePerKm + autonomyKm para que los llamadores (evaluación de
 * alertas, listado de devices) compartan un único cálculo de autonomía en
 * vez de rederivarlo distinto cada vez. Esta función es el núcleo del
 * cálculo predictivo de combustible pedido en la prueba técnica.
 */
export function computeAutonomyKm(
  readingsAscending: FuelReading[],
  tankCapacityL: number,
): number | null {
  const segment = detectRefuel(readingsAscending, tankCapacityL);
  const slope = consumptionRatePerKm(segment);
  const currentLiters =
    readingsAscending[readingsAscending.length - 1]?.liters ?? null;
  if (currentLiters === null) {
    return null;
  }
  return autonomyKm(currentLiters, slope);
}

/**
 * Km/h promedio sobre el mismo segmento post-repostaje y ventana móvil del
 * que computeAutonomyKm deriva su pendiente - se usa solo para convertir una
 * autonomía en km a un timestamp `predictedEmptyAt` (para la alerta de
 * "<1 hora de autonomía" pedida en la rúbrica). Null si el vehículo no se
 * movió (sin avance no hay ETA con sentido).
 */
export function estimateAvgSpeedKmh(
  readingsAscending: FuelReading[],
  tankCapacityL: number,
): number | null {
  const segment = detectRefuel(readingsAscending, tankCapacityL);
  const windowed = windowReadings(segment);

  if (windowed.length < 2) {
    return null;
  }

  const first = windowed[0];
  const last = windowed[windowed.length - 1];
  const hoursElapsed = (last.timestamp - first.timestamp) / 3_600_000;
  if (hoursElapsed <= 0) {
    return null;
  }

  const kmDriven = last.odometerKm - first.odometerKm;
  return kmDriven > 0 ? kmDriven / hoursElapsed : null;
}

export function shouldAlert(state: FuelAlertState): FuelAlertDecision {
  const { autonomyKm: autonomyKmValue, now, lastAlertAt, alertActive } = state;

  if (autonomyKmValue === null) {
    return { fire: false, close: false, severity: null };
  }

  if (alertActive && autonomyKmValue > ALERT_CLOSE_KM) {
    return { fire: false, close: true, severity: null };
  }

  if (autonomyKmValue >= ALERT_THRESHOLD_KM) {
    return { fire: false, close: false, severity: null };
  }

  const severity: FuelAlertSeverity =
    autonomyKmValue < ALERT_CRITICAL_KM ? "CRITICAL" : "WARNING";

  const recentlyAlerted =
    lastAlertAt !== null && now - lastAlertAt < ALERT_DEDUPE_MS;

  if (recentlyAlerted) {
    return { fire: false, close: false, severity: null };
  }

  return { fire: true, close: false, severity };
}

/** Porcentaje de tanque lleno, acotado a [0, 100]. Capacidad no positiva se lee como vacío. */
export function fuelLevelPct(
  fuelLiters: number,
  tankCapacityL: number,
): number {
  if (tankCapacityL <= 0) return 0;
  const pct = (fuelLiters / tankCapacityL) * 100;
  return Math.min(100, Math.max(0, pct));
}

export interface ConsumptionModelParams {
  baseRateLph: number;
  refSpeedKph: number;
  noiseStdDevLph: number;
}

/** L/h consumidos a `speedKph`, escalado linealmente contra una velocidad de referencia, más ruido. Nunca negativo. */
export function consumptionLitersPerHour(
  speedKph: number,
  params: ConsumptionModelParams,
  noise: number,
): number {
  const base = params.baseRateLph * (speedKph / params.refSpeedKph);
  return Math.max(0, base + noise);
}
