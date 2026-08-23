import { Injectable, NotFoundException } from '@nestjs/common';
import { Alert, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryGateway } from '../ws/telemetry.gateway';
import {
  AUTONOMY_WINDOW_MS,
  FuelReading,
  computeAutonomyKm,
  estimateAvgSpeedKmh,
  shouldAlert,
} from '../../../shared/fuel';
import { decodeCursor, encodeCursor } from '../../../shared/cursor';
import { CursorQuery, ListAlertsQuery } from './alerts.dto';

const ALERT_TYPE_LOW_FUEL = 'LOW_FUEL';

interface DeviceAlertState {
  alertActive: boolean;
  lastAlertAt: number | null;
}

export interface AlertView {
  id: string;
  deviceId: string;
  type: string;
  severity: string;
  predictedEmptyAt: string | null;
  distanceRemainingKm: number | null;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface ListAlertsResult {
  items: AlertView[];
  nextCursor: string | null;
}

export type AckStatus = 'ok' | 'conflict';

export interface AckResult {
  status: AckStatus;
  alert: AlertView;
}

function toAlertView(alert: Alert): AlertView {
  return {
    id: alert.id,
    deviceId: alert.deviceId,
    type: alert.type,
    severity: alert.severity,
    predictedEmptyAt: alert.predictedEmptyAt?.toISOString() ?? null,
    distanceRemainingKm: alert.distanceRemainingKm,
    createdAt: alert.createdAt.toISOString(),
    acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: alert.acknowledgedBy,
  };
}

@Injectable()
export class AlertsService {
  // Alert dedupe/close state per device. Not persisted: the schema has no
  // "resolved" field, so a restart just means the next fire starts a fresh
  // dedupe window instead of resuming one - acceptable for this pipeline.
  private readonly alertState = new Map<string, DeviceAlertState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelemetryGateway,
  ) {}

  /**
   * Loads the trailing 15-minute window for `deviceId`, hands it to the pure
   * decision functions in shared/fuel.ts, and persists+broadcasts the result.
   * Called by TelemetryService right after a reading is persisted - this is
   * the only place that owns alert state, so it never re-derives the fuel
   * math itself.
   */
  async evaluate(deviceId: string): Promise<Alert | null> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      return null;
    }

    const latest = await this.prisma.telemetryReading.findFirst({
      where: { deviceId },
      orderBy: { recordedAt: 'desc' },
    });
    if (!latest) {
      return null;
    }

    const windowStart = new Date(latest.recordedAt.getTime() - AUTONOMY_WINDOW_MS);
    const windowed = await this.prisma.telemetryReading.findMany({
      where: { deviceId, recordedAt: { gte: windowStart, lte: latest.recordedAt } },
      orderBy: { recordedAt: 'asc' },
    });

    const fuelReadings: FuelReading[] = windowed.map((r) => ({
      timestamp: r.recordedAt.getTime(),
      liters: r.fuelLiters,
      odometerKm: r.odometerKm,
    }));
    const autonomyKm = computeAutonomyKm(fuelReadings, device.tankCapacityL);

    const state = this.alertState.get(deviceId) ?? { alertActive: false, lastAlertAt: null };
    const decision = shouldAlert({
      autonomyKm,
      now: latest.recordedAt.getTime(),
      lastAlertAt: state.lastAlertAt,
      alertActive: state.alertActive,
    });

    if (decision.close) {
      this.alertState.set(deviceId, { alertActive: false, lastAlertAt: state.lastAlertAt });
      return null;
    }

    if (!decision.fire) {
      return null;
    }

    this.alertState.set(deviceId, { alertActive: true, lastAlertAt: latest.recordedAt.getTime() });

    // predictedEmptyAt is a secondary, informational ETA - km is the primary
    // metric, this just reprojects it into a timestamp using the same
    // window's average speed. Null (not moving) means no sensible ETA.
    const avgSpeedKmh = estimateAvgSpeedKmh(fuelReadings, device.tankCapacityL);
    const predictedEmptyAt =
      autonomyKm === null || avgSpeedKmh === null || avgSpeedKmh <= 0
        ? null
        : new Date(latest.recordedAt.getTime() + (autonomyKm / avgSpeedKmh) * 3_600_000);

    const alert = await this.prisma.alert.create({
      data: {
        deviceId,
        type: ALERT_TYPE_LOW_FUEL,
        severity: decision.severity as string,
        predictedEmptyAt,
        distanceRemainingKm: autonomyKm === null ? null : Math.round(autonomyKm),
      },
    });

    this.gateway.broadcastAlert({
      id: alert.id,
      deviceId: alert.deviceId,
      type: alert.type,
      severity: alert.severity,
      predictedEmptyAt: alert.predictedEmptyAt?.toISOString() ?? null,
      distanceRemainingKm: alert.distanceRemainingKm,
      createdAt: alert.createdAt.toISOString(),
    });

    return alert;
  }

  async list(query: ListAlertsQuery): Promise<ListAlertsResult> {
    const conditions: Prisma.AlertWhereInput[] = [];

    if (query.status === 'active') {
      conditions.push({ acknowledgedAt: null });
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = new Date(cursor.orderKey);
      conditions.push({
        OR: [{ createdAt: { gt: cursorDate } }, { createdAt: cursorDate, id: { gt: cursor.id } }],
      });
    }

    const where: Prisma.AlertWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    return this.paginate(where, query.limit);
  }

  async listForDevice(deviceId: string, query: CursorQuery): Promise<ListAlertsResult> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException(`device not found: ${deviceId}`);
    }

    const conditions: Prisma.AlertWhereInput[] = [{ deviceId }];

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = new Date(cursor.orderKey);
      conditions.push({
        OR: [{ createdAt: { gt: cursorDate } }, { createdAt: cursorDate, id: { gt: cursor.id } }],
      });
    }

    return this.paginate({ AND: conditions }, query.limit);
  }

  /**
   * Resolves an ack with a single conditional UPDATE (`WHERE acknowledgedAt
   * IS NULL`) rather than a read-then-write: two admins racing on the same
   * alert can only ever have one UPDATE affect a row, so there is no window
   * where both reads see it unacknowledged and both writes "succeed".
   */
  async acknowledge(alertId: string, userId: string, idempotencyKey?: string): Promise<AckResult> {
    const updated = await this.prisma.alert.updateMany({
      where: { id: alertId, acknowledgedAt: null },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
        ackIdempotencyKey: idempotencyKey ?? null,
      },
    });

    if (updated.count === 1) {
      const alert = await this.prisma.alert.findUnique({ where: { id: alertId } });
      return { status: 'ok', alert: toAlertView(alert as Alert) };
    }

    const existing = await this.prisma.alert.findUnique({ where: { id: alertId } });
    if (!existing) {
      throw new NotFoundException(`alert not found: ${alertId}`);
    }

    // Same client retrying its own winning ack (e.g. after a dropped
    // response): replay the success instead of a spurious 409.
    if (idempotencyKey && existing.ackIdempotencyKey === idempotencyKey) {
      return { status: 'ok', alert: toAlertView(existing) };
    }

    return { status: 'conflict', alert: toAlertView(existing) };
  }

  private async paginate(where: Prisma.AlertWhereInput, limit: number): Promise<ListAlertsResult> {
    const rows = await this.prisma.alert.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toAlertView),
      nextCursor:
        hasMore && last
          ? encodeCursor({ orderKey: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }
}
