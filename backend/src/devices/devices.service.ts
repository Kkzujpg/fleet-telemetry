import { Injectable, NotFoundException } from '@nestjs/common';
import { Alert, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AUTONOMY_WINDOW_MS, FuelReading, computeAutonomyKm } from '../../../shared/fuel';
import {
  DeviceConnectivityStatus,
  ONLINE_THRESHOLD_MS,
  STALE_THRESHOLD_MS,
  deriveDeviceStatus,
} from '../../../shared/device-status';
import { decodeCursor, encodeCursor } from '../../../shared/cursor';
import { HistoryQuery, ListDevicesQuery, PatchDeviceBody } from './devices.dto';

export interface LatestReadingView {
  recordedAt: string;
  lat: number;
  lng: number;
  speedKph: number;
  fuelLevelPct: number;
  fuelLiters: number;
  engineTempC: number;
  odometerKm: number;
}

export interface DeviceListItem {
  id: string;
  publicId: string;
  plate: string;
  operationalStatus: string;
  connectivityStatus: DeviceConnectivityStatus;
  lastSeenAt: string | null;
  latestReading: LatestReadingView | null;
  autonomyKm: number | null;
}

export interface ListDevicesResult {
  items: DeviceListItem[];
  nextCursor: string | null;
}

export interface ActiveAlertView {
  id: string;
  type: string;
  severity: string;
  predictedEmptyAt: string | null;
  distanceRemainingKm: number | null;
  createdAt: string;
}

export interface DeviceDetail extends DeviceListItem {
  tankCapacityL: number;
  activeAlerts: ActiveAlertView[];
}

export interface HistoryBucket {
  bucket: string;
  avgFuelLevelPct: number;
  avgSpeedKph: number;
  maxSpeedKph: number;
}

interface RawHistoryRow {
  bucket: Date;
  avgFuelLevelPct: number | string | null;
  avgSpeedKph: number | string | null;
  maxSpeedKph: number | string | null;
}

interface DeviceWithLatestReading {
  id: string;
  publicId: string;
  plate: string;
  status: string;
  tankCapacityL: number;
  lastSeenAt: Date | null;
  createdAt: Date;
  readings: {
    recordedAt: Date;
    lat: number;
    lng: number;
    speedKph: number;
    fuelLevelPct: number;
    fuelLiters: number;
    engineTempC: number;
    odometerKm: number;
  }[];
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListDevicesQuery, now: Date = new Date()): Promise<ListDevicesResult> {
    const conditions: Prisma.DeviceWhereInput[] = [];

    if (query.q) {
      conditions.push({
        OR: [
          { plate: { contains: query.q, mode: 'insensitive' } },
          { publicId: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }

    if (query.status) {
      conditions.push(connectivityWhereClause(query.status, now));
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = new Date(cursor.orderKey);
      conditions.push({
        OR: [{ createdAt: { gt: cursorDate } }, { createdAt: cursorDate, id: { gt: cursor.id } }],
      });
    }

    const where: Prisma.DeviceWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const rows = (await this.prisma.device.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      include: { readings: { orderBy: { recordedAt: 'desc' }, take: 1 } },
    })) as DeviceWithLatestReading[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const items = await Promise.all(page.map((device) => this.toListItem(device, now)));
    const last = page[page.length - 1];

    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({ orderKey: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async detail(id: string, now: Date = new Date()): Promise<DeviceDetail> {
    const device = (await this.prisma.device.findUnique({
      where: { id },
      include: {
        readings: { orderBy: { recordedAt: 'desc' }, take: 1 },
        alerts: { where: { acknowledgedAt: null }, orderBy: { createdAt: 'desc' } },
      },
    })) as (DeviceWithLatestReading & { alerts: Alert[] }) | null;

    if (!device) {
      throw new NotFoundException(`device not found: ${id}`);
    }

    const listItem = await this.toListItem(device, now);

    return {
      ...listItem,
      tankCapacityL: device.tankCapacityL,
      activeAlerts: device.alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        predictedEmptyAt: alert.predictedEmptyAt?.toISOString() ?? null,
        distanceRemainingKm: alert.distanceRemainingKm,
        createdAt: alert.createdAt.toISOString(),
      })),
    };
  }

  async history(deviceId: string, query: HistoryQuery): Promise<HistoryBucket[]> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException(`device not found: ${deviceId}`);
    }

    // date_bin() hace el downsampling en Postgres: traer cada fila cruda a
    // Node y promediar ahí enviaría todo el rango por cable en cada request
    // de historial.
    const intervalLiteral = `${query.bucketSeconds} seconds`;
    const rows = await this.prisma.$queryRaw<RawHistoryRow[]>`
      SELECT
        date_bin(${intervalLiteral}::interval, "recordedAt", ${query.from}) AS bucket,
        avg("fuelLevelPct") AS "avgFuelLevelPct",
        avg("speedKph") AS "avgSpeedKph",
        max("speedKph") AS "maxSpeedKph"
      FROM "TelemetryReading"
      WHERE "deviceId" = ${deviceId}
        AND "recordedAt" >= ${query.from}
        AND "recordedAt" < ${query.to}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    return rows.map((row) => ({
      bucket: row.bucket.toISOString(),
      avgFuelLevelPct: Number(row.avgFuelLevelPct ?? 0),
      avgSpeedKph: Number(row.avgSpeedKph ?? 0),
      maxSpeedKph: Number(row.maxSpeedKph ?? 0),
    }));
  }

  async update(id: string, patch: PatchDeviceBody): Promise<DeviceDetail> {
    const existing = await this.prisma.device.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`device not found: ${id}`);
    }

    await this.prisma.device.update({
      where: { id },
      data: {
        plate: patch.plate,
        tankCapacityL: patch.tankCapacityL,
        status: patch.status,
      },
    });

    return this.detail(id);
  }

  private async toListItem(device: DeviceWithLatestReading, now: Date): Promise<DeviceListItem> {
    const latest = device.readings[0] ?? null;
    const autonomyKm = latest
      ? await this.computeAutonomyKmAsOf(device.id, device.tankCapacityL, latest.recordedAt)
      : null;

    return {
      id: device.id,
      publicId: device.publicId,
      plate: device.plate,
      operationalStatus: device.status,
      connectivityStatus: deriveDeviceStatus(device.lastSeenAt, now),
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      latestReading: latest
        ? {
            recordedAt: latest.recordedAt.toISOString(),
            lat: latest.lat,
            lng: latest.lng,
            speedKph: latest.speedKph,
            fuelLevelPct: latest.fuelLevelPct,
            fuelLiters: latest.fuelLiters,
            engineTempC: latest.engineTempC,
            odometerKm: latest.odometerKm,
          }
        : null,
      autonomyKm,
    };
  }

  private async computeAutonomyKmAsOf(
    deviceId: string,
    tankCapacityL: number,
    asOf: Date,
  ): Promise<number | null> {
    const windowStart = new Date(asOf.getTime() - AUTONOMY_WINDOW_MS);
    const windowed = await this.prisma.telemetryReading.findMany({
      where: { deviceId, recordedAt: { gte: windowStart, lte: asOf } },
      orderBy: { recordedAt: 'asc' },
    });

    const fuelReadings: FuelReading[] = windowed.map((r) => ({
      timestamp: r.recordedAt.getTime(),
      liters: r.fuelLiters,
      odometerKm: r.odometerKm,
    }));
    return computeAutonomyKm(fuelReadings, tankCapacityL);
  }
}

function connectivityWhereClause(
  status: DeviceConnectivityStatus,
  now: Date,
): Prisma.DeviceWhereInput {
  const onlineCutoff = new Date(now.getTime() - ONLINE_THRESHOLD_MS);
  const staleCutoff = new Date(now.getTime() - STALE_THRESHOLD_MS);

  switch (status) {
    case 'online':
      return { lastSeenAt: { gte: onlineCutoff } };
    case 'stale':
      return { lastSeenAt: { gte: staleCutoff, lt: onlineCutoff } };
    case 'offline':
      return { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: staleCutoff } }] };
  }
}
