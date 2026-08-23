import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TelemetryService } from '../../src/telemetry/telemetry.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TelemetryGateway } from '../../src/ws/telemetry.gateway';
import { AlertsService } from '../../src/alerts/alerts.service';
import { IngestTelemetryPayload, parseIngestPayload } from '../../src/telemetry/telemetry.dto';

const DEVICE = {
  id: 'device-uuid-1',
  publicId: 'DEV-1234-XC54',
  plate: 'ABC123',
  tankCapacityL: 60,
  status: 'ACTIVE',
  lastSeenAt: null as Date | null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function payload(overrides: Partial<IngestTelemetryPayload> = {}): IngestTelemetryPayload {
  return {
    devicePublicId: DEVICE.publicId,
    recordedAt: new Date('2026-08-23T12:00:00.000Z'),
    lat: 4.65,
    lng: -74.1,
    speedKph: 40,
    fuelLevelPct: 50,
    engineTempC: 88,
    odometerKm: 1000,
    ...overrides,
  };
}

interface Mocks {
  deviceFindUnique: jest.Mock;
  deviceUpdate: jest.Mock;
  readingFindUnique: jest.Mock;
  readingCreate: jest.Mock;
  readingFindMany: jest.Mock;
}

function uniqueViolation(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target },
  });
}

function buildService(): {
  service: TelemetryService;
  prisma: Mocks;
  gateway: { broadcastReading: jest.Mock; broadcastAlert: jest.Mock };
  alerts: { evaluate: jest.Mock };
} {
  const prisma: Mocks = {
    deviceFindUnique: jest.fn().mockResolvedValue(DEVICE),
    deviceUpdate: jest.fn().mockResolvedValue(DEVICE),
    readingFindUnique: jest.fn().mockResolvedValue(null),
    readingCreate: jest
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ id: 'reading-1', ...data })),
    readingFindMany: jest.fn().mockResolvedValue([]),
  };

  const fakePrisma = {
    device: { findUnique: prisma.deviceFindUnique, update: prisma.deviceUpdate },
    telemetryReading: {
      findUnique: prisma.readingFindUnique,
      create: prisma.readingCreate,
      findMany: prisma.readingFindMany,
    },
  } as unknown as PrismaService;

  const gateway = { broadcastReading: jest.fn(), broadcastAlert: jest.fn() };
  const alerts = { evaluate: jest.fn().mockResolvedValue(null) };

  const service = new TelemetryService(
    fakePrisma,
    gateway as unknown as TelemetryGateway,
    alerts as unknown as AlertsService,
  );

  return { service, prisma, gateway, alerts };
}

describe('TelemetryService.ingest', () => {
  test('throws NotFoundException for an unknown device publicId', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindUnique.mockResolvedValueOnce(null);

    await expect(service.ingest(payload())).rejects.toThrow(NotFoundException);
    expect(prisma.readingCreate).not.toHaveBeenCalled();
  });

  test('creates the reading, derives fuelLiters server-side, and broadcasts the position', async () => {
    const { service, prisma, gateway } = buildService();

    const result = await service.ingest(payload({ fuelLevelPct: 50 }));

    expect(prisma.readingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceId: DEVICE.id,
          recordedAt: payload().recordedAt,
          fuelLevelPct: 50,
          fuelLiters: 30, // 50% of a 60L tank
        }),
      }),
    );
    expect(gateway.broadcastReading).toHaveBeenCalledWith(
      DEVICE.id,
      expect.objectContaining({ speedKph: 40, fuelLiters: 30 }),
    );
    expect(result.alert).toBeNull();
    expect(result.duplicate).toBe(false);
  });

  test('advances lastSeenAt when the reading is newer than the current value', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindUnique.mockResolvedValueOnce({
      ...DEVICE,
      lastSeenAt: new Date('2026-08-23T11:00:00.000Z'),
    });

    await service.ingest(payload({ recordedAt: new Date('2026-08-23T12:00:00.000Z') }));

    expect(prisma.deviceUpdate).toHaveBeenCalledWith({
      where: { id: DEVICE.id },
      data: { lastSeenAt: new Date('2026-08-23T12:00:00.000Z') },
    });
  });

  test('does not move lastSeenAt backwards for an out-of-order (late-arriving) reading', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindUnique.mockResolvedValueOnce({
      ...DEVICE,
      lastSeenAt: new Date('2026-08-23T12:00:00.000Z'),
    });

    await service.ingest(payload({ recordedAt: new Date('2026-08-23T11:00:00.000Z') }));

    expect(prisma.deviceUpdate).not.toHaveBeenCalled();
  });

  test('a retry with the same (deviceId, recordedAt) returns the existing row with duplicate:true, never a second insert', async () => {
    const { service, prisma } = buildService();
    const existing = { id: 'reading-1', deviceId: DEVICE.id, recordedAt: payload().recordedAt };
    prisma.readingFindUnique.mockResolvedValueOnce(existing);

    const result = await service.ingest(payload());

    expect(result).toEqual({ reading: existing, alert: null, duplicate: true });
    expect(prisma.readingCreate).not.toHaveBeenCalled();
  });

  test('a retry with the same Idempotency-Key returns the existing row with duplicate:true', async () => {
    const { service, prisma } = buildService();
    const existing = { id: 'reading-1', deviceId: DEVICE.id, idempotencyKey: 'retry-1' };
    prisma.readingFindUnique.mockResolvedValueOnce(existing);

    const result = await service.ingest(payload(), 'retry-1');

    expect(prisma.readingFindUnique).toHaveBeenCalledWith({
      where: { deviceId_idempotencyKey: { deviceId: DEVICE.id, idempotencyKey: 'retry-1' } },
    });
    expect(result).toEqual({ reading: existing, alert: null, duplicate: true });
    expect(prisma.readingCreate).not.toHaveBeenCalled();
  });

  test('a concurrent duplicate insert (unique violation) is swallowed into a 200 duplicate, never a 500', async () => {
    const { service, prisma } = buildService();
    prisma.readingCreate.mockRejectedValueOnce(uniqueViolation(['deviceId', 'recordedAt']));
    const existing = { id: 'reading-1', deviceId: DEVICE.id, recordedAt: payload().recordedAt };
    prisma.readingFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);

    const result = await service.ingest(payload());

    expect(result).toEqual({ reading: existing, alert: null, duplicate: true });
  });

  // Fuel-trend fire/dedupe/close logic lives in AlertsService (and is
  // covered by test/alerts/alerts.service.spec.ts): TelemetryService only
  // delegates to it after persisting the reading, and never re-derives the
  // fuel math itself.
  test('delegates alert evaluation to AlertsService.evaluate(deviceId) and forwards its result', async () => {
    const { service, prisma, alerts } = buildService();
    const fakeAlert = {
      id: 'alert-1',
      deviceId: DEVICE.id,
      type: 'LOW_FUEL',
      severity: 'WARNING',
      predictedEmptyAt: null,
      distanceRemainingKm: 40,
      createdAt: new Date('2026-08-23T12:00:00.000Z'),
      acknowledgedAt: null,
      acknowledgedBy: null,
      ackIdempotencyKey: null,
    };
    alerts.evaluate.mockResolvedValueOnce(fakeAlert);

    const result = await service.ingest(payload());

    expect(alerts.evaluate).toHaveBeenCalledWith(DEVICE.id);
    expect(result.alert).toBe(fakeAlert);
    expect(prisma.readingFindMany).not.toHaveBeenCalled();
  });

  test('a null result from AlertsService.evaluate means no alert on the ingest result', async () => {
    const { service, alerts } = buildService();
    alerts.evaluate.mockResolvedValueOnce(null);

    const result = await service.ingest(payload());

    expect(result.alert).toBeNull();
  });
});

describe('TelemetryService.ingestBatch', () => {
  test('reports per-index accepted/rejected status without failing the whole batch', async () => {
    const { service } = buildService();

    const items = [
      { index: 0, payload: payload({ recordedAt: new Date('2026-08-23T12:00:00.000Z') }) },
      { index: 1, error: 'fuelLevelPct must be between 0 and 100' },
      { index: 2, payload: payload({ recordedAt: new Date('2026-08-23T12:05:00.000Z') }) },
    ];

    const result = await service.ingestBatch(items);

    expect(result.results.map((r) => r.status)).toEqual(['accepted', 'rejected', 'accepted']);
    expect(result.results[1]).toEqual(
      expect.objectContaining({ index: 1, status: 'rejected', error: expect.any(String) }),
    );
  });

  test('scopes the Idempotency-Key header per item so retried batches report duplicate, not accepted twice', async () => {
    const { service, prisma } = buildService();
    const existing = { id: 'reading-1', deviceId: DEVICE.id, idempotencyKey: 'batch-1:0' };
    prisma.readingFindUnique.mockResolvedValueOnce(existing);

    const result = await service.ingestBatch([{ index: 0, payload: payload() }], 'batch-1');

    expect(result.results[0].status).toBe('duplicate');
  });
});

describe('TelemetryService.reconcile', () => {
  test('returns readings with a nextCursor when there is another page', async () => {
    const { service, prisma } = buildService();
    const rows = Array.from({ length: 201 }, (_, i) => ({
      id: `r${i}`,
      deviceId: DEVICE.id,
      device: { publicId: DEVICE.publicId },
      recordedAt: new Date(2026, 0, 1, 0, i),
      ingestedAt: new Date(2026, 0, 1, 0, i),
      lat: 0,
      lng: 0,
      speedKph: 0,
      fuelLevelPct: 0,
      fuelLiters: 0,
      engineTempC: 0,
      odometerKm: 0,
    }));
    prisma.readingFindMany.mockResolvedValueOnce(rows);

    const result = await service.reconcile({});

    expect(result.readings).toHaveLength(200);
    expect(result.nextCursor).not.toBeNull();
  });

  test('returns nextCursor:null when the page is not full', async () => {
    const { service, prisma } = buildService();
    prisma.readingFindMany.mockResolvedValueOnce([
      {
        id: 'r0',
        deviceId: DEVICE.id,
        device: { publicId: DEVICE.publicId },
        recordedAt: new Date('2026-08-23T12:00:00.000Z'),
        ingestedAt: new Date('2026-08-23T12:00:00.000Z'),
        lat: 0,
        lng: 0,
        speedKph: 0,
        fuelLevelPct: 0,
        fuelLiters: 0,
        engineTempC: 0,
        odometerKm: 0,
      },
    ]);

    const result = await service.reconcile({ deviceIds: [DEVICE.id] });

    expect(result.readings).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(prisma.readingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deviceId: { in: [DEVICE.id] } }),
      }),
    );
  });
});

describe('parseIngestPayload validation', () => {
  const NOW = new Date('2026-08-23T12:00:00.000Z');

  test('rejects lat outside -90..90', () => {
    expect(() => parseIngestPayload({ ...raw(), lat: 91 }, NOW)).toThrow(BadRequestException);
  });

  test('rejects lng outside -180..180', () => {
    expect(() => parseIngestPayload({ ...raw(), lng: -181 }, NOW)).toThrow(BadRequestException);
  });

  test('rejects fuelLevelPct outside 0..100', () => {
    expect(() => parseIngestPayload({ ...raw(), fuelLevelPct: 101 }, NOW)).toThrow(
      BadRequestException,
    );
  });

  test('rejects a recordedAt more than 5 minutes in the future', () => {
    const future = new Date(NOW.getTime() + 6 * 60_000).toISOString();
    expect(() => parseIngestPayload({ ...raw(), recordedAt: future }, NOW)).toThrow(
      BadRequestException,
    );
  });

  test('accepts a recordedAt within the 5-minute clock-drift margin', () => {
    const withinDrift = new Date(NOW.getTime() + 4 * 60_000).toISOString();
    expect(() => parseIngestPayload({ ...raw(), recordedAt: withinDrift }, NOW)).not.toThrow();
  });

  function raw(): Record<string, unknown> {
    return {
      devicePublicId: DEVICE.publicId,
      recordedAt: NOW.toISOString(),
      lat: 4.65,
      lng: -74.1,
      speedKph: 40,
      fuelLevelPct: 50,
      engineTempC: 88,
      odometerKm: 1000,
    };
  }
});
