export type HistoryRangeKey = "1h" | "6h" | "24h";

export interface HistoryRangeConfig {
  hours: number;
  bucket: string;
  bucketSeconds: number;
}

export const HISTORY_RANGES: Record<HistoryRangeKey, HistoryRangeConfig> = {
  "1h": { hours: 1, bucket: "1m", bucketSeconds: 60 },
  "6h": { hours: 6, bucket: "5m", bucketSeconds: 300 },
  "24h": { hours: 24, bucket: "15m", bucketSeconds: 900 },
};

/** date_bin() solo devuelve buckets con lecturas - un timestamp ausente ES un hueco. */
export interface RawHistoryBucket {
  bucket: string;
  avgFuelLevelPct: number;
  avgSpeedKph: number;
  maxSpeedKph: number;
}

export interface HistoryChartPoint {
  t: number;
  fuelLiters: number | null;
  avgSpeedKph: number | null;
  maxSpeedKph: number | null;
}

/** Inserta un punto null en el punto medio cuando el hueco entre buckets consecutivos supera 2x bucketSeconds - la serie se corta ahí en vez de unir con recta. */
export function toHistoryChartPoints(
  buckets: RawHistoryBucket[],
  bucketSeconds: number,
  tankCapacityL: number,
): HistoryChartPoint[] {
  const gapMs = bucketSeconds * 2 * 1000;
  const points: HistoryChartPoint[] = [];

  for (const raw of buckets) {
    const t = Date.parse(raw.bucket);
    const prev = points[points.length - 1];
    if (prev && t - prev.t > gapMs) {
      points.push({ t: prev.t + (t - prev.t) / 2, fuelLiters: null, avgSpeedKph: null, maxSpeedKph: null });
    }
    points.push({
      t,
      fuelLiters: (raw.avgFuelLevelPct / 100) * tankCapacityL,
      avgSpeedKph: raw.avgSpeedKph,
      maxSpeedKph: raw.maxSpeedKph,
    });
  }

  return points;
}

/** Litros restantes al llegar a `markerKm` de autonomía, derivado del ritmo de consumo actual (L/km = fuelLiters/autonomyKm). Null si autonomyKm no es calculable (ver shared/fuel.ts). */
export function autonomyThresholdLiters(
  currentFuelLiters: number,
  autonomyKm: number | null,
  markerKm: number,
): number | null {
  if (autonomyKm === null || autonomyKm <= 0) return null;
  return (currentFuelLiters * markerKm) / autonomyKm;
}
