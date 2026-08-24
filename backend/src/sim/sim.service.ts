import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { routeForIndex } from './routes';
import { tickVehicle, VehicleSimState } from './vehicle-sim-engine';
import { ConsumptionModelParams } from '../../../shared/fuel';
import { RandomSource } from '../../../shared/gaussian-noise';

const TICK_MS = 3000;
const SIM_MINUTES_PER_TICK = 2;
const DRAIN_FUEL_RATIO = 0.03;
// El tope de adelanto de abajo fija el reloj del simulador a velocidad 1x
// (tiempo real) a los pocos ticks - mantenerse cerca del tiempo real es
// necesario tanto para el chequeo de clock-skew futuro del ingest como para
// el estado online/stale del device (shared/device-status.ts), así que no se
// puede compensar acelerando el reloj. En su lugar, el loop en vivo quema
// combustible mucho más rápido que un motor real, para que un tanque lleno
// igual dispare una alerta LOW_FUEL a los pocos minutos de mirar el
// dashboard. El seed de historial (backend/prisma/seed.ts) NO usa esto -
// llama a tickVehicle con el valor realista por defecto para que el backfill
// de 6h siga pareciendo un viaje plausible.
const DEMO_CONSUMPTION_PARAMS: ConsumptionModelParams = {
  baseRateLph: 300,
  refSpeedKph: 60,
  noiseStdDevLph: 0.6,
};
// El ingest rechaza cualquier recordedAt más de 5min adelantado al reloj
// real (ver FUTURE_CLOCK_SKEW_MS en telemetry.dto.ts). A 2 minutos-sim por
// tick de 3s el reloj del simulador se pasaría de eso en ~3 ticks y cada
// lectura después quedaría rechazada en silencio para siempre (un fetch que
// resuelve con status no-ok no se trata acá como error). Quedarse por debajo
// con margen asegura que cada tick se registre.
const MAX_LEAD_MS = 4 * 60_000;

export interface SimStatus {
  running: boolean;
  vehicleCount: number;
}

@Injectable()
export class SimService {
  private readonly logger = new Logger(SimService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private states = new Map<string, VehicleSimState>();
  // Tiempo simulado, no tiempo real: cada tick comprime SIM_MINUTES_PER_TICK
  // de manejo en TICK_MS de tiempo real. recordedAt debe seguir este reloj -
  // sellar los ticks con Date.now() real haría que la regresión de
  // combustible viera, por ejemplo, "2 minutos de combustible quemados en 3
  // segundos" y lo leyera como una tasa de consumo absurda que dispara
  // alertas.
  private clockMs = 0;
  // No inyectable por el constructor porque Nest resolvería este param como
  // provider vía DI (falla al bootear, un tipo función no es un token
  // registrado) - start() lo acepta en cambio, así los tests pueden fijar una
  // fuente con seed para volver determinístico el drenaje de combustible sin
  // tocar el wiring de producción, que sigue usando Math.random por defecto.
  private randomSource: RandomSource = Math.random;

  constructor(private readonly prisma: PrismaService) {}

  async start(randomSource: RandomSource = Math.random): Promise<SimStatus> {
    if (this.timer) {
      return this.status();
    }
    this.randomSource = randomSource;

    const devices = await this.prisma.device.findMany({ orderBy: { publicId: 'asc' } });
    this.states = new Map(
      await Promise.all(
        devices.map(async (device, index) => {
          const latest = await this.prisma.telemetryReading.findFirst({
            where: { deviceId: device.id },
            orderBy: { recordedAt: 'desc' },
          });

          return [
            device.id,
            {
              deviceId: device.id,
              publicId: device.publicId,
              tankCapacityL: device.tankCapacityL,
              route: routeForIndex(index),
              progressKm: 0,
              // Cada llamada a start() es una corrida nueva, no una
              // reanudación - se rellena el tanque en vez de continuar donde
              // quedó la corrida anterior (a menudo casi vacío, ya que la
              // tasa de consumo de demo está ajustada para drenar rápido).
              // El odómetro sí se mantiene, así que el kilometraje sigue
              // siendo continuo entre reinicios.
              fuelLiters: device.tankCapacityL,
              odometerKm: latest?.odometerKm ?? 0,
            } satisfies VehicleSimState,
          ] as const;
        }),
      ),
    );

    this.clockMs = Date.now();
    this.timer = setInterval(() => {
      void this.tickAll();
    }, TICK_MS);

    return this.status();
  }

  stop(): SimStatus {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.states.clear();
    return this.status();
  }

  /** `devicePublicId` porque el cliente (un operador admin) solo conoce el identificador público. */
  drain(devicePublicId: string): SimStatus {
    const entry = [...this.states.values()].find((state) => state.publicId === devicePublicId);
    if (!entry) {
      throw new NotFoundException(
        `device ${devicePublicId} is not tracked by the running simulator`,
      );
    }
    entry.fuelLiters = entry.tankCapacityL * DRAIN_FUEL_RATIO;
    return this.status();
  }

  status(): SimStatus {
    return { running: this.timer !== null, vehicleCount: this.states.size };
  }

  private async tickAll(): Promise<void> {
    // Una vez que el reloj choca contra el tope de adelanto, esto se reduce
    // hacia el ritmo del tiempo real en vez de los 2 minutos-sim habituales -
    // tanto el timestamp como la física de abajo avanzan por la misma
    // cantidad (posiblemente menor), así que el combustible/distancia
    // quemados siempre coinciden con el hueco entre lecturas y nunca se leen
    // como una tasa de consumo anómala.
    const desiredClockMs = this.clockMs + SIM_MINUTES_PER_TICK * 60_000;
    const cappedClockMs = Math.min(desiredClockMs, Date.now() + MAX_LEAD_MS);
    const deltaSimHours = (cappedClockMs - this.clockMs) / 3_600_000;
    this.clockMs = cappedClockMs;
    const recordedAt = new Date(this.clockMs).toISOString();

    for (const [deviceId, state] of this.states) {
      const { state: next, reading } = tickVehicle(state, {
        deltaSimHours,
        randomSource: this.randomSource,
        consumptionParams: DEMO_CONSUMPTION_PARAMS,
      });
      this.states.set(deviceId, next);

      const body = { devicePublicId: next.publicId, recordedAt, ...reading };

      try {
        await fetch(this.ingestUrl(), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (error) {
        this.logger.warn(`failed to post telemetry for ${next.publicId}: ${(error as Error).message}`);
      }
    }
  }

  private ingestUrl(): string {
    const port = process.env.PORT ?? 3001;
    return `http://localhost:${port}/api/v1/telemetry`;
  }
}
