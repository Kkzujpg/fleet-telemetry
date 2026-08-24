import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { routeForIndex } from './routes';
import { tickVehicle, VehicleSimState } from './vehicle-sim-engine';
import { ConsumptionModelParams } from '../../../shared/fuel';

const TICK_MS = 3000;
const SIM_MINUTES_PER_TICK = 2;
const DRAIN_FUEL_RATIO = 0.03;
// The lead cap below locks the sim clock to 1x (wall-clock) speed within a
// few ticks - staying near real time is required for both the ingest future
// -skew check and the device online/stale status (shared/device-status.ts),
// so we can't compensate by running the clock faster. Instead the live loop
// burns fuel much faster than a real engine would, so a full tank still hits
// a LOW_FUEL alert within a few minutes of watching the dashboard. History
// seeding (backend/prisma/seed.ts) does NOT use this - it calls tickVehicle
// with the realistic default so the 6h backfill still looks like a plausible
// trip.
const DEMO_CONSUMPTION_PARAMS: ConsumptionModelParams = {
  baseRateLph: 300,
  refSpeedKph: 60,
  noiseStdDevLph: 0.6,
};
// Ingest rejects any recordedAt more than 5min ahead of wall-clock (see
// FUTURE_CLOCK_SKEW_MS in telemetry.dto.ts). At 2 sim-minutes per 3s tick the
// sim clock would blow past that in ~3 ticks and every reading after would be
// silently rejected forever (fetch resolving with a non-ok status isn't
// treated as an error here). Staying under it with margin keeps every tick
// landing.
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
  // Simulated time, not wall-clock time: ticks compress SIM_MINUTES_PER_TICK
  // of driving into TICK_MS of real time. recordedAt must follow this clock -
  // stamping ticks with real Date.now() would make the fuel regression see
  // e.g. "2 minutes worth of fuel burned in 3 seconds" and read as an
  // absurd, alert-triggering consumption rate.
  private clockMs = 0;

  constructor(private readonly prisma: PrismaService) {}

  async start(): Promise<SimStatus> {
    if (this.timer) {
      return this.status();
    }

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
              // Every start() call is a fresh run, not a resume - refill the
              // tank instead of picking up from wherever the last run left
              // it (often near-empty, since the demo consumption rate is
              // tuned to drain fast). Odometer still carries over so mileage
              // stays continuous across restarts.
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

  /** `devicePublicId` because the client (an admin operator) only ever knows the public identifier. */
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
    // Once the clock has run up against the lead cap, this shrinks toward the
    // pace of real time instead of the usual 2 sim-minutes - both the
    // timestamp and the physics below advance by the same (possibly smaller)
    // amount, so fuel/distance burned always matches the gap between
    // readings and never reads as an anomalous consumption rate.
    const desiredClockMs = this.clockMs + SIM_MINUTES_PER_TICK * 60_000;
    const cappedClockMs = Math.min(desiredClockMs, Date.now() + MAX_LEAD_MS);
    const deltaSimHours = (cappedClockMs - this.clockMs) / 3_600_000;
    this.clockMs = cappedClockMs;
    const recordedAt = new Date(this.clockMs).toISOString();

    for (const [deviceId, state] of this.states) {
      const { state: next, reading } = tickVehicle(state, {
        deltaSimHours,
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
