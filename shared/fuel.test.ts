import {
  consumptionRatePerKm,
  detectRefuel,
  autonomyKm,
  computeAutonomyKm,
  estimateAvgSpeedKmh,
  shouldAlert,
  fuelLevelPct,
  consumptionLitersPerHour,
  FuelReading,
  FuelAlertState,
} from "./fuel";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

function reading(minutesOffset: number, liters: number, odometerKm: number): FuelReading {
  return { timestamp: T0 + minutesOffset * MIN, liters, odometerKm };
}

describe("consumptionRatePerKm", () => {
  test("consumo constante da la pendiente exacta de mínimos cuadrados (L/km)", () => {
    const readings: FuelReading[] = [
      reading(0, 100, 0),
      reading(5, 98, 10),
      reading(10, 96, 20),
      reading(15, 94, 30),
    ];

    const rate = consumptionRatePerKm(readings);

    expect(rate).not.toBeNull();
    expect(rate as number).toBeCloseTo(-0.2, 5);
  });

  test("consumo con ruido recupera la pendiente dentro de tolerancia", () => {
    const noise = [0.1, -0.15, 0.05, -0.05, 0.1, -0.1];
    const readings: FuelReading[] = noise.map((n, i) =>
      reading(i * 3, 100 - i * 1 + n, i * 5),
    );

    const rate = consumptionRatePerKm(readings);

    expect(rate).not.toBeNull();
    expect(Math.abs((rate as number) - -0.2)).toBeLessThan(0.05);
  });

  test("devuelve null con menos de 3 lecturas en la ventana de 15 minutos", () => {
    const readings: FuelReading[] = [reading(0, 100, 0), reading(5, 98, 10)];

    expect(consumptionRatePerKm(readings)).toBeNull();
  });

  test("ignora lecturas más antiguas que la ventana de 15 minutos", () => {
    const readings: FuelReading[] = [
      reading(-120, 500, -1000),
      reading(0, 100, 0),
      reading(5, 98, 10),
      reading(10, 96, 20),
      reading(15, 94, 30),
    ];

    const rate = consumptionRatePerKm(readings);

    expect(rate as number).toBeCloseTo(-0.2, 5);
  });

  test("devuelve null cuando el vehículo recorrió menos de 0.3km en la ventana (parado, jitter de odómetro)", () => {
    const readings: FuelReading[] = [
      reading(0, 100, 1000),
      reading(5, 99.9, 1000.05),
      reading(10, 99.8, 1000.1),
    ];

    expect(consumptionRatePerKm(readings)).toBeNull();
  });
});

describe("detectRefuel", () => {
  test("corta la ventana en un salto mayor al 5% del tanque, quedándose solo con el segmento posterior", () => {
    const readings: FuelReading[] = [
      reading(0, 100, 0),
      reading(3, 98, 6),
      reading(6, 96, 12),
      reading(9, 111, 18),
      reading(12, 108, 24),
      reading(15, 105, 30),
    ];

    const segment = detectRefuel(readings, 200);

    expect(segment).toEqual([
      reading(9, 111, 18),
      reading(12, 108, 24),
      reading(15, 105, 30),
    ]);
  });

  test("devuelve todas las lecturas sin cambios cuando ningún salto supera el umbral", () => {
    const readings: FuelReading[] = [
      reading(0, 100, 0),
      reading(5, 98, 10),
      reading(10, 96, 20),
    ];

    expect(detectRefuel(readings, 200)).toEqual(readings);
  });

  test("pasar el segmento post-repostaje a consumptionRatePerKm refleja solo el nuevo llenado", () => {
    const readings: FuelReading[] = [
      reading(0, 100, 0),
      reading(3, 98, 6),
      reading(6, 96, 12),
      reading(9, 111, 18),
      reading(12, 108, 24),
      reading(15, 105, 30),
    ];

    const segment = detectRefuel(readings, 200);
    const rate = consumptionRatePerKm(segment);

    expect(rate as number).toBeCloseTo(-0.5, 5);
  });
});

describe("autonomyKm", () => {
  test("calcula km restantes a partir de litros actuales y una pendiente negativa", () => {
    expect(autonomyKm(48, -24)).toBeCloseTo(2, 5);
  });

  test("devuelve null para un vehículo detenido (pendiente mayor a -0.005 L/km)", () => {
    expect(autonomyKm(50, -0.001)).toBeNull();
    expect(autonomyKm(50, 0)).toBeNull();
    expect(autonomyKm(50, 0.002)).toBeNull();
  });

  test("calcula normalmente cuando la pendiente es exactamente -0.005 L/km (límite incluido en el rango usable)", () => {
    expect(autonomyKm(50, -0.005)).toBeCloseTo(10_000, 5);
  });
});

describe("computeAutonomyKm", () => {
  test("null sin suficientes lecturas para una tendencia", () => {
    const readings: FuelReading[] = [reading(0, 100, 0), reading(5, 98, 10)];
    expect(computeAutonomyKm(readings, 200)).toBeNull();
  });

  test("null cuando el vehículo está detenido (pendiente no negativa)", () => {
    const readings: FuelReading[] = [
      reading(0, 100, 0),
      reading(5, 100, 10),
      reading(10, 100, 20),
    ];
    expect(computeAutonomyKm(readings, 200)).toBeNull();
  });

  test("km = litros actuales / -pendiente, usando el segmento post-repostaje", () => {
    const readings: FuelReading[] = [
      reading(0, 100, 0),
      reading(3, 98, 6),
      reading(6, 96, 12),
      reading(9, 111, 18),
      reading(12, 108, 24),
      reading(15, 105, 30),
    ];

    // Igual que el test de detectRefuel+consumptionRatePerKm: pendiente
    // -0.5 L/km sobre el segmento post-repostaje, con 105 L actuales -> 210km.
    expect(computeAutonomyKm(readings, 200)).toBeCloseTo(210, 5);
  });
});

describe("estimateAvgSpeedKmh", () => {
  test("null sin al menos 2 lecturas en la ventana", () => {
    const readings: FuelReading[] = [reading(0, 100, 0)];
    expect(estimateAvgSpeedKmh(readings, 200)).toBeNull();
  });

  test("km recorridos / horas transcurridas en el segmento post-repostaje y ventana de 15 min", () => {
    const readings: FuelReading[] = [
      reading(0, 100, 0),
      reading(3, 98, 6),
      reading(6, 96, 12),
      reading(9, 111, 18),
      reading(12, 108, 24),
      reading(15, 105, 30),
    ];

    // Segmento post-repostaje: min 9->15 (0.1h), odómetro 18->30 (12km).
    expect(estimateAvgSpeedKmh(readings, 200)).toBeCloseTo(120, 5);
  });

  test("null cuando el vehículo no se movió en la ventana (evita ETA con velocidad cero)", () => {
    const readings: FuelReading[] = [
      reading(0, 100, 1000),
      reading(5, 99, 1000),
      reading(10, 98, 1000),
    ];
    expect(estimateAvgSpeedKmh(readings, 200)).toBeNull();
  });
});

describe("shouldAlert", () => {
  function state(overrides: Partial<FuelAlertState>): FuelAlertState {
    return {
      autonomyKm: null,
      now: T0,
      lastAlertAt: null,
      alertActive: false,
      ...overrides,
    };
  }

  test("dispara WARNING bajo 50km de autonomía", () => {
    const decision = shouldAlert(state({ autonomyKm: 45 }));

    expect(decision.fire).toBe(true);
    expect(decision.severity).toBe("WARNING");
  });

  test("dispara CRITICAL bajo 15km de autonomía", () => {
    const decision = shouldAlert(state({ autonomyKm: 10 }));

    expect(decision.fire).toBe(true);
    expect(decision.severity).toBe("CRITICAL");
  });

  test("no dispara en 50km o más", () => {
    const decision = shouldAlert(state({ autonomyKm: 50 }));

    expect(decision.fire).toBe(false);
  });

  test("cierra una alerta activa cuando la autonomía supera 65km", () => {
    const decision = shouldAlert(
      state({
        autonomyKm: 70,
        alertActive: true,
        lastAlertAt: T0 - 30 * MIN,
      }),
    );

    expect(decision.close).toBe(true);
    expect(decision.fire).toBe(false);
  });

  test("no emite dos alertas dentro de una ventana de 10 minutos", () => {
    const first = shouldAlert(state({ autonomyKm: 45, now: T0 }));
    expect(first.fire).toBe(true);

    const second = shouldAlert(
      state({
        autonomyKm: 40,
        now: T0 + 5 * MIN,
        alertActive: true,
        lastAlertAt: T0,
      }),
    );

    expect(second.fire).toBe(false);
  });

  test("secuencia completa: warn, dedupe, escala a critical tras la ventana de dedupe, luego cierra", () => {
    const decisions: Array<{
      fire: boolean;
      close: boolean;
      severity: string | null;
    }> = [];

    let alertActive = false;
    let lastAlertAt: number | null = null;

    function step(now: number, autonomyKmValue: number) {
      const d = shouldAlert({ autonomyKm: autonomyKmValue, now, lastAlertAt, alertActive });
      decisions.push({ fire: d.fire, close: d.close, severity: d.severity });
      if (d.fire) {
        alertActive = true;
        lastAlertAt = now;
      }
      if (d.close) {
        alertActive = false;
      }
      return d;
    }

    step(T0, 45);
    step(T0 + 5 * MIN, 40);
    step(T0 + 11 * MIN, 10);
    step(T0 + 90 * MIN, 70);

    expect(decisions).toEqual([
      { fire: true, close: false, severity: "WARNING" },
      { fire: false, close: false, severity: null },
      { fire: true, close: false, severity: "CRITICAL" },
      { fire: false, close: true, severity: null },
    ]);

    const fireCount = decisions.filter((d) => d.fire).length;
    for (let i = 1; i < decisions.length; i++) {
      if (decisions[i].fire && decisions[i - 1].fire) {
        throw new Error("se dispararon dos alertas seguidas");
      }
    }
    expect(fireCount).toBe(2);
  });
});

describe("fuelLevelPct", () => {
  test("calcula el porcentaje del tanque", () => {
    expect(fuelLevelPct(25, 50)).toBe(50);
  });

  test("satura en 100 si los litros superan la capacidad", () => {
    expect(fuelLevelPct(60, 50)).toBe(100);
  });

  test("satura en 0 con litros negativos", () => {
    expect(fuelLevelPct(-5, 50)).toBe(0);
  });

  test("devuelve 0 con capacidad de tanque no positiva en vez de dividir por cero", () => {
    expect(fuelLevelPct(10, 0)).toBe(0);
  });
});

describe("consumptionLitersPerHour", () => {
  const params = { baseRateLph: 8, refSpeedKph: 60, noiseStdDevLph: 0.6 };

  test("es proporcional a la velocidad sin ruido", () => {
    expect(consumptionLitersPerHour(60, params, 0)).toBeCloseTo(8, 5);
    expect(consumptionLitersPerHour(30, params, 0)).toBeCloseTo(4, 5);
    expect(consumptionLitersPerHour(0, params, 0)).toBeCloseTo(0, 5);
  });

  test("suma el ruido a la tasa base", () => {
    expect(consumptionLitersPerHour(60, params, 1.5)).toBeCloseTo(9.5, 5);
  });

  test("nunca es negativo aunque el ruido lo sea", () => {
    expect(consumptionLitersPerHour(0, params, -5)).toBe(0);
  });
});
