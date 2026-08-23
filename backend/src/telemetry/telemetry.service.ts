import { Injectable, NotFoundException } from '@nestjs/common';
import { Alert, Prisma, TelemetryReading } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryGateway } from '../ws/telemetry.gateway';
import { AlertsService } from '../alerts/alerts.service';
import { decodeCursor, encodeCursor } from '../../../shared/cursor';
import { IngestTelemetryPayload } from './telemetry.dto';

const RECONCILE_PAGE_SIZE = 200;

export interface IngestResult {
  reading: TelemetryReading;
  alert: Alert | null;
  duplicate: boolean;
}

export type BatchItemStatus = 'accepted' | 'duplicate' | 'rejected';

export interface BatchItemResult {
  index: number;
  status: BatchItemStatus;
  readingId?: string;
  error?: string;
}

export interface BatchIngestResult {
  results: BatchItemResult[];
}

export type BatchItemInput =
  { index: number; payload: IngestTelemetryPayload } | { index: number; error: string };

export interface ReconcileQuery {
  since?: string;
  deviceIds?: string[];
}

export interface ReconcileReading {
  id: string;
  deviceId: string;
  // Nested (not a flat `devicePublicId`) so MaskingInterceptor's plain
  // `key === 'publicId'` walk catches it like every other publicId in the API.
  device: { publicId: string };
  recordedAt: string;
  lat: number;
  lng: number;
  speedKph: number;
  fuelLevelPct: number;
  fuelLiters: number;
  engineTempC: number;
  odometerKm: number;
}

export interface ReconcileResult {
  readings: ReconcileReading[];
  nextCursor: string | null;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelemetryGateway,
    private readonly alerts: AlertsService,
  ) {}

  async ingest(payload: IngestTelemetryPayload, idempotencyKey?: string): Promise<IngestResult> {
    const device = await this.prisma.device.findUnique({
      where: { publicId: payload.devicePublicId },
    });
    if (!device) {
      throw new NotFoundException(`unknown device publicId: ${payload.devicePublicId}`);
    }

    const existing = await this.findExistingReading(device.id, payload.recordedAt, idempotencyKey);
    if (existing) {
      return { reading: existing, alert: null, duplicate: true };
    }

    // fuelLiters is derived here, never trusted from the client: if it were
    // client-computed, correcting a mis-registered tankCapacityL later would
    // silently corrupt every past reading's stored liters.
    const fuelLiters = (payload.fuelLevelPct / 100) * device.tankCapacityL;

    let reading: TelemetryReading;
    try {
      reading = await this.prisma.telemetryReading.create({
        data: {
          deviceId: device.id,
          recordedAt: payload.recordedAt,
          lat: payload.lat,
          lng: payload.lng,
          speedKph: payload.speedKph,
          fuelLevelPct: payload.fuelLevelPct,
          fuelLiters,
          engineTempC: payload.engineTempC,
          odometerKm: payload.odometerKm,
          idempotencyKey: idempotencyKey ?? null,
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const raced = await this.findExistingReading(device.id, payload.recordedAt, idempotencyKey);
        if (raced) {
          return { reading: raced, alert: null, duplicate: true };
        }
      }
      throw error;
    }

    if (!device.lastSeenAt || payload.recordedAt > device.lastSeenAt) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: payload.recordedAt },
      });
    }

    const alert = await this.alerts.evaluate(device.id);

    this.gateway.broadcastReading(device.id, {
      lat: reading.lat,
      lng: reading.lng,
      speedKph: reading.speedKph,
      fuelLiters: reading.fuelLiters,
      engineTempC: reading.engineTempC,
      recordedAt: reading.recordedAt.toISOString(),
    });

    return { reading, alert, duplicate: false };
  }

  async ingestBatch(items: BatchItemInput[], idempotencyKey?: string): Promise<BatchIngestResult> {
    const results: BatchItemResult[] = [];

    for (const item of items) {
      if ('error' in item) {
        results.push({ index: item.index, status: 'rejected', error: item.error });
        continue;
      }

      try {
        const perItemKey = idempotencyKey ? `${idempotencyKey}:${item.index}` : undefined;
        const { reading, duplicate } = await this.ingest(item.payload, perItemKey);
        results.push({
          index: item.index,
          status: duplicate ? 'duplicate' : 'accepted',
          readingId: reading.id,
        });
      } catch (error) {
        results.push({
          index: item.index,
          status: 'rejected',
          error: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }

    return { results: results.sort((a, b) => a.index - b.index) };
  }

  async reconcile(query: ReconcileQuery): Promise<ReconcileResult> {
    const cursor = query.since ? decodeCursor(query.since) : null;

    const where: Prisma.TelemetryReadingWhereInput = {};
    if (query.deviceIds && query.deviceIds.length > 0) {
      where.deviceId = { in: query.deviceIds };
    }
    if (cursor) {
      const cursorDate = new Date(cursor.orderKey);
      where.OR = [
        { ingestedAt: { gt: cursorDate } },
        { ingestedAt: cursorDate, id: { gt: cursor.id } },
      ];
    }

    const rows = await this.prisma.telemetryReading.findMany({
      where,
      orderBy: [{ ingestedAt: 'asc' }, { id: 'asc' }],
      take: RECONCILE_PAGE_SIZE + 1,
      include: { device: { select: { publicId: true } } },
    });

    const hasMore = rows.length > RECONCILE_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, RECONCILE_PAGE_SIZE) : rows;
    const last = page[page.length - 1];

    return {
      readings: page.map((r) => ({
        id: r.id,
        deviceId: r.deviceId,
        device: { publicId: r.device.publicId },
        recordedAt: r.recordedAt.toISOString(),
        lat: r.lat,
        lng: r.lng,
        speedKph: r.speedKph,
        fuelLevelPct: r.fuelLevelPct,
        fuelLiters: r.fuelLiters,
        engineTempC: r.engineTempC,
        odometerKm: r.odometerKm,
      })),
      nextCursor:
        hasMore && last
          ? encodeCursor({ orderKey: last.ingestedAt.toISOString(), id: last.id })
          : null,
    };
  }

  private async findExistingReading(
    deviceId: string,
    recordedAt: Date,
    idempotencyKey?: string,
  ): Promise<TelemetryReading | null> {
    if (idempotencyKey) {
      const byKey = await this.prisma.telemetryReading.findUnique({
        where: { deviceId_idempotencyKey: { deviceId, idempotencyKey } },
      });
      if (byKey) {
        return byKey;
      }
    }
    return this.prisma.telemetryReading.findUnique({
      where: { deviceId_recordedAt: { deviceId, recordedAt } },
    });
  }
}
