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
  // Estado de dedupe/cierre de alerta por device. No se persiste: el schema
  // no tiene campo "resolved", así que un reinicio solo hace que el próximo
  // disparo arranque una ventana de dedupe nueva en vez de reanudar una -
  // aceptable para este pipeline.
  private readonly alertState = new Map<string, DeviceAlertState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelemetryGateway,
  ) {}

  /**
   * Carga la ventana móvil de 15 minutos de `deviceId`, se la pasa a las
   * funciones puras de decisión de shared/fuel.ts, y persiste+difunde el
   * resultado. Se llama desde TelemetryService justo después de persistir
   * una lectura - este es el único lugar dueño del estado de alerta, así que
   * nunca rederiva la matemática de combustible por su cuenta. Esta función
   * implementa el requisito de "alerta si el nivel baja a <1 hora de
   * autonomía" (ver predictedEmptyAt más abajo).
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

    // predictedEmptyAt es un ETA secundario, informativo - km es la métrica
    // primaria, esto solo la reproyecta a un timestamp usando la velocidad
    // promedio de la misma ventana. Null (sin movimiento) significa que no
    // hay ETA con sentido.
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
   * Resuelve un ack con un único UPDATE condicional (`WHERE acknowledgedAt
   * IS NULL`) en vez de leer-y-luego-escribir: dos admins compitiendo por la
   * misma alerta solo pueden lograr que un UPDATE afecte la fila, así que no
   * hay ventana donde ambas lecturas la vean sin reconocer y ambas
   * escrituras "tengan éxito".
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

    // El mismo cliente reintentando su propio ack ganador (ej: tras una
    // respuesta perdida): repite el éxito en vez de un 409 espurio.
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
