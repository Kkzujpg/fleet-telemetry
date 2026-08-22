import {
  consumptionRate,
  detectRefuel,
  autonomyHours,
  shouldAlert,
  FuelReading,
  FuelAlertState,
} from "./fuel";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

function reading(minutesOffset: number, liters: number): FuelReading {
  return { timestamp: T0 + minutesOffset * MIN, liters };
}

describe("consumptionRate", () => {
  test("consumo constante da la pendiente exacta de mínimos cuadrados", () => {
    const readings: FuelReading[] = [
      reading(0, 100),
      reading(5, 98),
      reading(10, 96),
      reading(15, 94),
    ];

    const rate = consumptionRate(readings);

    expect(rate).not.toBeNull();
    expect(rate as number).toBeCloseTo(-24, 5);
  });

  test("consumo con ruido recupera la pendiente dentro de tolerancia", () => {
    const noise = [0.1, -0.15, 0.05, -0.05, 0.1, -0.1];
    const readings: FuelReading[] = noise.map((n, i) =>
      reading(i * 3, 100 - i * 1 + n),
    );

    const rate = consumptionRate(readings);

    expect(rate).not.toBeNull();
    expect(Math.abs((rate as number) - -20)).toBeLessThan(2);
  });

  test("devuelve null con menos de 3 lecturas en la ventana de 15 minutos", () => {
    const readings: FuelReading[] = [reading(0, 100), reading(5, 98)];

    expect(consumptionRate(readings)).toBeNull();
  });

  test("devuelve null cuando todas las lecturas comparten el mismo timestamp", () => {
    const readings: FuelReading[] = [
      reading(0, 100),
      reading(0, 99),
      reading(0, 98),
    ];

    expect(consumptionRate(readings)).toBeNull();
  });

  test("ignora lecturas más antiguas que la ventana de 15 minutos", () => {
    const readings: FuelReading[] = [
      reading(-120, 500),
      reading(0, 100),
      reading(5, 98),
      reading(10, 96),
      reading(15, 94),
    ];

    const rate = consumptionRate(readings);

    expect(rate as number).toBeCloseTo(-24, 5);
  });
});

describe("detectRefuel", () => {
  test("corta la ventana en un salto mayor al 5% del tanque, quedándose solo con el segmento posterior", () => {
    const readings: FuelReading[] = [
      reading(0, 100),
      reading(3, 98),
      reading(6, 96),
      reading(9, 111),
      reading(12, 108),
      reading(15, 105),
    ];

    const segment = detectRefuel(readings, 200);

    expect(segment).toEqual([reading(9, 111), reading(12, 108), reading(15, 105)]);
  });

  test("devuelve todas las lecturas sin cambios cuando ningún salto supera el umbral", () => {
    const readings: FuelReading[] = [
      reading(0, 100),
      reading(5, 98),
      reading(10, 96),
    ];

    expect(detectRefuel(readings, 200)).toEqual(readings);
  });

  test("pasar el segmento post-repostaje a consumptionRate refleja solo el nuevo llenado", () => {
    const readings: FuelReading[] = [
      reading(0, 100),
      reading(3, 98),
      reading(6, 96),
      reading(9, 111),
      reading(12, 108),
      reading(15, 105),
    ];

    const segment = detectRefuel(readings, 200);
    const rate = consumptionRate(segment);

    expect(rate as number).toBeCloseTo(-60, 5);
  });
});

describe("autonomyHours", () => {
  test("calcula horas restantes a partir de litros actuales y una pendiente negativa", () => {
    expect(autonomyHours(48, -24)).toBeCloseTo(2, 5);
  });

  test("devuelve null para un vehículo detenido (pendiente mayor a -0.05 L/h)", () => {
    expect(autonomyHours(50, -0.01)).toBeNull();
    expect(autonomyHours(50, 0)).toBeNull();
    expect(autonomyHours(50, 0.02)).toBeNull();
  });

  test("calcula normalmente cuando la pendiente es exactamente -0.05 L/h (límite incluido en el rango usable)", () => {
    expect(autonomyHours(50, -0.05)).toBeCloseTo(1000, 5);
  });
});

describe("shouldAlert", () => {
  function state(overrides: Partial<FuelAlertState>): FuelAlertState {
    return {
      autonomyMinutes: null,
      now: T0,
      lastAlertAt: null,
      alertActive: false,
      ...overrides,
    };
  }

  test("dispara WARNING bajo 60 minutos de autonomía", () => {
    const decision = shouldAlert(state({ autonomyMinutes: 55 }));

    expect(decision.fire).toBe(true);
    expect(decision.severity).toBe("WARNING");
  });

  test("dispara CRITICAL bajo 20 minutos de autonomía", () => {
    const decision = shouldAlert(state({ autonomyMinutes: 15 }));

    expect(decision.fire).toBe(true);
    expect(decision.severity).toBe("CRITICAL");
  });

  test("no dispara en 60 minutos o más", () => {
    const decision = shouldAlert(state({ autonomyMinutes: 60 }));

    expect(decision.fire).toBe(false);
  });

  test("cierra una alerta activa cuando la autonomía supera 75 minutos", () => {
    const decision = shouldAlert(
      state({ autonomyMinutes: 80, alertActive: true, lastAlertAt: T0 - 30 * MIN }),
    );

    expect(decision.close).toBe(true);
    expect(decision.fire).toBe(false);
  });

  test("no emite dos alertas dentro de una ventana de 10 minutos", () => {
    const first = shouldAlert(state({ autonomyMinutes: 55, now: T0 }));
    expect(first.fire).toBe(true);

    const second = shouldAlert(
      state({
        autonomyMinutes: 50,
        now: T0 + 5 * MIN,
        alertActive: true,
        lastAlertAt: T0,
      }),
    );

    expect(second.fire).toBe(false);
  });

  test("secuencia completa: warn, dedupe, escala a critical tras la ventana de dedupe, luego cierra", () => {
    const decisions: Array<{ fire: boolean; close: boolean; severity: string | null }> = [];

    let alertActive = false;
    let lastAlertAt: number | null = null;

    function step(now: number, autonomyMinutes: number) {
      const d = shouldAlert({ autonomyMinutes, now, lastAlertAt, alertActive });
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

    step(T0, 55);
    step(T0 + 5 * MIN, 50);
    step(T0 + 11 * MIN, 15);
    step(T0 + 90 * MIN, 80);

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
