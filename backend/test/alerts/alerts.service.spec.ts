import { NotFoundException } from '@nestjs/common';
import { AlertsService } from '../../src/alerts/alerts.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TelemetryGateway } from '../../src/ws/telemetry.gateway';

const DEVICE = {
  id: 'device-uuid-1',
  publicId: 'DEV-1234-XC54',
  tankCapacityL: 60,
};

interface Mocks {
  deviceFindUnique: jest.Mock;
  readingFindFirst: jest.Mock;
  readingFindMany: jest.Mock;
  alertCreate: jest.Mock;
  alertFindMany: jest.Mock;
  alertUpdateMany: jest.Mock;
  alertFindUnique: jest.Mock;
}

function buildService(): {
  service: AlertsService;
  prisma: Mocks;
  gateway: { broadcastAlert: jest.Mock };
} {
  const prisma: Mocks = {
    deviceFindUnique: jest.fn().mockResolvedValue(DEVICE),
    readingFindFirst: jest.fn().mockResolvedValue(null),
    readingFindMany: jest.fn().mockResolvedValue([]),
    alertCreate: jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'alert-1',
        createdAt: new Date('2026-08-23T12:00:00.000Z'),
        acknowledgedAt: null,
        acknowledgedBy: null,
        ackIdempotencyKey: null,
        ...data,
      }),
    ),
    alertFindMany: jest.fn().mockResolvedValue([]),
    alertUpdateMany: jest.fn().mockResolvedValue({ count: 1 }),
    alertFindUnique: jest.fn().mockResolvedValue(null),
  };

  const fakePrisma = {
    device: { findUnique: prisma.deviceFindUnique },
    telemetryReading: { findFirst: prisma.readingFindFirst, findMany: prisma.readingFindMany },
    alert: {
      create: prisma.alertCreate,
      findMany: prisma.alertFindMany,
      updateMany: prisma.alertUpdateMany,
      findUnique: prisma.alertFindUnique,
    },
  } as unknown as PrismaService;

  const gateway = { broadcastAlert: jest.fn() };
  const service = new AlertsService(fakePrisma, gateway as unknown as TelemetryGateway);

  return { service, prisma, gateway };
}

const MIN = 60_000;
function readingRow(id: string, recordedAt: Date, fuelLiters: number, odometerKm: number) {
  return {
    id,
    deviceId: DEVICE.id,
    recordedAt,
    fuelLiters,
    lat: 0,
    lng: 0,
    speedKph: 40,
    fuelLevelPct: 0,
    engineTempC: 88,
    odometerKm,
    ingestedAt: recordedAt,
  };
}

describe('AlertsService.evaluate', () => {
  test('returns null for an unknown device, without touching alert/create', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindUnique.mockResolvedValueOnce(null);

    const result = await service.evaluate('missing-device');

    expect(result).toBeNull();
    expect(prisma.alertCreate).not.toHaveBeenCalled();
  });

  test('returns null when the device has no readings yet', async () => {
    const { service, prisma } = buildService();
    prisma.readingFindFirst.mockResolvedValueOnce(null);

    const result = await service.evaluate(DEVICE.id);

    expect(result).toBeNull();
    expect(prisma.alertCreate).not.toHaveBeenCalled();
  });

  test('fires and persists a LOW_FUEL alert once autonomy drops under threshold, storing predictedEmptyAt/distanceRemainingKm, then broadcasts', async () => {
    const { service, prisma, gateway } = buildService();
    const t0 = new Date('2026-08-23T12:00:00.000Z').getTime();
    // 5km every 5min (60km/h), fuel 5L->4.5L->4L: slope -0.1 L/km, 4L left
    // -> 40km autonomy, under the 50km WARNING threshold.
    const latest = readingRow('r2', new Date(t0 + 10 * MIN), 4, 110);
    const history = [
      readingRow('r0', new Date(t0), 5, 100),
      readingRow('r1', new Date(t0 + 5 * MIN), 4.5, 105),
      latest,
    ];
    prisma.readingFindFirst.mockResolvedValueOnce(latest);
    prisma.readingFindMany.mockResolvedValueOnce(history);

    const alert = await service.evaluate(DEVICE.id);

    expect(alert).not.toBeNull();
    expect(prisma.alertCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceId: DEVICE.id,
          type: 'LOW_FUEL',
          predictedEmptyAt: expect.any(Date),
          distanceRemainingKm: expect.any(Number),
        }),
      }),
    );
    expect(gateway.broadcastAlert).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: DEVICE.id, type: 'LOW_FUEL' }),
    );
  });

  test('does not fire twice inside the dedupe window for the same device', async () => {
    const { service, prisma } = buildService();
    const t0 = new Date('2026-08-23T12:00:00.000Z').getTime();
    const history = [
      readingRow('r0', new Date(t0), 5, 100),
      readingRow('r1', new Date(t0 + 5 * MIN), 4.5, 105),
      readingRow('r2', new Date(t0 + 10 * MIN), 4, 110),
    ];
    prisma.readingFindFirst.mockResolvedValueOnce(history[2]);
    prisma.readingFindMany.mockResolvedValueOnce(history);
    await service.evaluate(DEVICE.id);

    const nextLatest = readingRow('r3', new Date(t0 + 15 * MIN), 3.5, 115);
    prisma.readingFindFirst.mockResolvedValueOnce(nextLatest);
    prisma.readingFindMany.mockResolvedValueOnce([...history, nextLatest]);
    const second = await service.evaluate(DEVICE.id);

    expect(second).toBeNull();
    expect(prisma.alertCreate).toHaveBeenCalledTimes(1);
  });

  test('does not fire when there is not enough history to compute a trend', async () => {
    const { service, prisma } = buildService();
    const only = readingRow('r0', new Date('2026-08-23T12:00:00.000Z'), 5, 100);
    prisma.readingFindFirst.mockResolvedValueOnce(only);
    prisma.readingFindMany.mockResolvedValueOnce([only]);

    const result = await service.evaluate(DEVICE.id);

    expect(result).toBeNull();
    expect(prisma.alertCreate).not.toHaveBeenCalled();
  });
});

describe('AlertsService.list', () => {
  test('status "active" filters to unacknowledged alerts', async () => {
    const { service, prisma } = buildService();

    await service.list({ status: 'active', limit: 20 });

    expect(prisma.alertFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ acknowledgedAt: null }] },
      }),
    );
  });

  test('status "all" applies no acknowledgedAt filter', async () => {
    const { service, prisma } = buildService();

    await service.list({ status: 'all', limit: 20 });

    const call = prisma.alertFindMany.mock.calls[0][0];
    expect(call.where?.acknowledgedAt).toBeUndefined();
  });

  test('returns a nextCursor when there are more rows than the page limit', async () => {
    const { service, prisma } = buildService();
    const rows = Array.from({ length: 2 }, (_, i) => ({
      id: `a${i}`,
      deviceId: DEVICE.id,
      type: 'LOW_FUEL',
      severity: 'WARNING',
      predictedEmptyAt: null,
      distanceRemainingKm: 40,
      createdAt: new Date(2026, 0, 1, 0, i),
      acknowledgedAt: null,
      acknowledgedBy: null,
    }));
    prisma.alertFindMany.mockResolvedValueOnce(rows);

    const result = await service.list({ status: 'active', limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
  });
});

describe('AlertsService.listForDevice', () => {
  test('throws NotFoundException for an unknown device', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindUnique.mockResolvedValueOnce(null);

    await expect(service.listForDevice('missing', { limit: 20 })).rejects.toThrow(
      NotFoundException,
    );
  });

  test('returns the alert history for a known device', async () => {
    const { service, prisma } = buildService();
    prisma.alertFindMany.mockResolvedValueOnce([
      {
        id: 'a0',
        deviceId: DEVICE.id,
        type: 'LOW_FUEL',
        severity: 'WARNING',
        predictedEmptyAt: new Date('2026-08-23T13:00:00.000Z'),
        distanceRemainingKm: 55,
        createdAt: new Date('2026-08-23T12:00:00.000Z'),
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
    ]);

    const result = await service.listForDevice(DEVICE.id, { limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].distanceRemainingKm).toBe(55);
    expect(prisma.alertFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ deviceId: DEVICE.id }] } }),
    );
  });
});

describe('AlertsService.acknowledge', () => {
  test('acknowledges via a conditional UPDATE and returns status "ok"', async () => {
    const { service, prisma } = buildService();
    prisma.alertUpdateMany.mockResolvedValueOnce({ count: 1 });
    prisma.alertFindUnique.mockResolvedValueOnce({
      id: 'alert-1',
      deviceId: DEVICE.id,
      type: 'LOW_FUEL',
      severity: 'WARNING',
      predictedEmptyAt: null,
      distanceRemainingKm: 40,
      createdAt: new Date('2026-08-23T12:00:00.000Z'),
      acknowledgedAt: new Date('2026-08-23T12:05:00.000Z'),
      acknowledgedBy: 'user-1',
    });

    const result = await service.acknowledge('alert-1', 'user-1');

    expect(result.status).toBe('ok');
    expect(result.alert.acknowledgedBy).toBe('user-1');
    expect(prisma.alertUpdateMany).toHaveBeenCalledWith({
      where: { id: 'alert-1', acknowledgedAt: null },
      data: expect.objectContaining({ acknowledgedBy: 'user-1' }),
    });
  });

  test('returns status "conflict" with the current state when zero rows were affected (already acked by someone else)', async () => {
    const { service, prisma } = buildService();
    prisma.alertUpdateMany.mockResolvedValueOnce({ count: 0 });
    prisma.alertFindUnique.mockResolvedValueOnce({
      id: 'alert-1',
      deviceId: DEVICE.id,
      type: 'LOW_FUEL',
      severity: 'WARNING',
      predictedEmptyAt: null,
      distanceRemainingKm: 40,
      createdAt: new Date('2026-08-23T12:00:00.000Z'),
      acknowledgedAt: new Date('2026-08-23T12:01:00.000Z'),
      acknowledgedBy: 'other-admin',
      ackIdempotencyKey: null,
    });

    const result = await service.acknowledge('alert-1', 'user-1');

    expect(result.status).toBe('conflict');
    expect(result.alert.acknowledgedBy).toBe('other-admin');
  });

  test('a retried ack with the same Idempotency-Key as the winning request returns status "ok" (idempotent replay)', async () => {
    const { service, prisma } = buildService();
    prisma.alertUpdateMany.mockResolvedValueOnce({ count: 0 });
    prisma.alertFindUnique.mockResolvedValueOnce({
      id: 'alert-1',
      deviceId: DEVICE.id,
      type: 'LOW_FUEL',
      severity: 'WARNING',
      predictedEmptyAt: null,
      distanceRemainingKm: 40,
      createdAt: new Date('2026-08-23T12:00:00.000Z'),
      acknowledgedAt: new Date('2026-08-23T12:01:00.000Z'),
      acknowledgedBy: 'user-1',
      ackIdempotencyKey: 'retry-key-1',
    });

    const result = await service.acknowledge('alert-1', 'user-1', 'retry-key-1');

    expect(result.status).toBe('ok');
  });

  test('throws NotFoundException for an unknown alert id', async () => {
    const { service, prisma } = buildService();
    prisma.alertUpdateMany.mockResolvedValueOnce({ count: 0 });
    prisma.alertFindUnique.mockResolvedValueOnce(null);

    await expect(service.acknowledge('missing', 'user-1')).rejects.toThrow(NotFoundException);
  });
});
