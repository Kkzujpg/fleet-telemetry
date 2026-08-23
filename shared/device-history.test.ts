import {
  HISTORY_RANGES,
  toHistoryChartPoints,
  autonomyThresholdLiters,
  RawHistoryBucket,
} from "./device-history";

function bucket(isoOffsetMin: number, avgFuelLevelPct: number, avgSpeedKph: number, maxSpeedKph: number): RawHistoryBucket {
  const t0 = Date.parse("2026-08-23T00:00:00.000Z");
  return {
    bucket: new Date(t0 + isoOffsetMin * 60_000).toISOString(),
    avgFuelLevelPct,
    avgSpeedKph,
    maxSpeedKph,
  };
}

describe("HISTORY_RANGES", () => {
  test("cada rango mantiene entre 60 y 200 puntos con su bucket", () => {
    for (const key of Object.keys(HISTORY_RANGES) as (keyof typeof HISTORY_RANGES)[]) {
      const { hours, bucketSeconds } = HISTORY_RANGES[key];
      const points = (hours * 3600) / bucketSeconds;
      expect(points).toBeGreaterThanOrEqual(60);
      expect(points).toBeLessThanOrEqual(200);
    }
  });
});

describe("toHistoryChartPoints", () => {
  test("convierte avgFuelLevelPct a litros usando la capacidad del tanque", () => {
    const points = toHistoryChartPoints([bucket(0, 50, 80, 100)], 60, 200);

    expect(points).toEqual([{ t: Date.parse("2026-08-23T00:00:00.000Z"), fuelLiters: 100, avgSpeedKph: 80, maxSpeedKph: 100 }]);
  });

  test("no inserta hueco cuando la distancia entre buckets es exactamente 2x", () => {
    const bucketSeconds = 60;
    const points = toHistoryChartPoints([bucket(0, 50, 0, 0), bucket(2, 50, 0, 0)], bucketSeconds, 200);

    expect(points).toHaveLength(2);
  });

  test("inserta un punto null en el punto medio cuando el hueco supera 2x el bucket", () => {
    const bucketSeconds = 60;
    const points = toHistoryChartPoints([bucket(0, 50, 0, 0), bucket(5, 50, 0, 0)], bucketSeconds, 200);

    expect(points).toHaveLength(3);
    expect(points[1]).toEqual({
      t: Date.parse("2026-08-23T00:02:30.000Z"),
      fuelLiters: null,
      avgSpeedKph: null,
      maxSpeedKph: null,
    });
  });

  test("un repostaje (salto hacia arriba) no se suaviza, queda como valores consecutivos reales", () => {
    const points = toHistoryChartPoints([bucket(0, 10, 0, 0), bucket(1, 90, 0, 0)], 60, 200);

    expect(points.map((p) => p.fuelLiters)).toEqual([20, 180]);
  });
});

describe("autonomyThresholdLiters", () => {
  test("deriva litros al llegar al umbral marcador a partir del ritmo de consumo actual", () => {
    expect(autonomyThresholdLiters(40, 120, 50)).toBe(200 / 12);
  });

  test("null cuando autonomyKm es null", () => {
    expect(autonomyThresholdLiters(40, null, 50)).toBeNull();
  });

  test("null cuando autonomyKm es 0 o negativo", () => {
    expect(autonomyThresholdLiters(40, 0, 50)).toBeNull();
    expect(autonomyThresholdLiters(40, -5, 50)).toBeNull();
  });
});
