import { NotFoundException } from '@nestjs/common';
import { DevicesService } from '../../src/devices/devices.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { encodeCursor } from '../../../shared/cursor';

const DEVICE = {
  id: 'device-uuid-1',
  publicId: 'DEV-0001-XC54',
  plate: 'ABC123',
  tankCapacityL: 60,
  status: 'ACTIVE',
  lastSeenAt: new Date('2026-08-23T11:59:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  alerts: [] as unknown[],
  readings: [
    {
      recordedAt: new Date('2026-08-23T11:59:00.000Z'),
      lat: 4.6,
      lng: -74.1,
      speedKph: 40,
      fuelLevelPct: 50,
      fuelLiters: 30,
      engineTempC: 88,
      odometerKm: 1000,
    },
  ],
};

interface Mocks {
  deviceFindMany: jest.Mock;
  deviceFindUnique: jest.Mock;
  deviceUpdate: jest.Mock;
  readingFindMany: jest.Mock;
  queryRaw: jest.Mock;
}

function buildService(): { service: DevicesService; prisma: Mocks } {
  const prisma: Mocks = {
    deviceFindMany: jest.fn().mockResolvedValue([DEVICE]),
    deviceFindUnique: jest.fn().mockResolvedValue(DEVICE),
    deviceUpdate: jest.fn().mockResolvedValue(DEVICE),
    readingFindMany: jest.fn().mockResolvedValue([]),
    queryRaw: jest.fn().mockResolvedValue([]),
  };

  const fakePrisma = {
    device: {
      findMany: prisma.deviceFindMany,
      findUnique: prisma.deviceFindUnique,
      update: prisma.deviceUpdate,
    },
    telemetryReading: { findMany: prisma.readingFindMany },
    $queryRaw: prisma.queryRaw,
  } as unknown as PrismaService;

  return { service: new DevicesService(fakePrisma), prisma };
}

describe('DevicesService.list', () => {
  test('maps the latest reading and derives connectivity status', async () => {
    const { service } = buildService();
    // 30s after lastSeenAt - inside ONLINE_THRESHOLD_MS (2min) regardless of
    // when the test actually runs.
    const now = new Date(DEVICE.lastSeenAt.getTime() + 30_000);

    const result = await service.list({ limit: 20 }, now);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: DEVICE.id,
        publicId: DEVICE.publicId,
        connectivityStatus: 'online',
        latestReading: expect.objectContaining({ fuelLiters: 30 }),
      }),
    );
    expect(result.nextCursor).toBeNull();
  });

  test('applies a cursor filter built from the previous page boundary', async () => {
    const { service, prisma } = buildService();
    const cursor = encodeCursor({ orderKey: '2026-01-01T00:00:00.000Z', id: 'device-uuid-0' });

    await service.list({ limit: 20, cursor });

    expect(prisma.deviceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { createdAt: { gt: new Date('2026-01-01T00:00:00.000Z') } },
                { createdAt: new Date('2026-01-01T00:00:00.000Z'), id: { gt: 'device-uuid-0' } },
              ],
            },
          ],
        },
      }),
    );
  });

  test('returns a nextCursor when there are more rows than the page limit', async () => {
    const { service, prisma } = buildService();
    const extra = {
      ...DEVICE,
      id: 'device-uuid-2',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    prisma.deviceFindMany.mockResolvedValueOnce([DEVICE, extra]);

    const result = await service.list({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
  });

  test('offline status when the device never reported (lastSeenAt null)', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindMany.mockResolvedValueOnce([{ ...DEVICE, lastSeenAt: null, readings: [] }]);

    const result = await service.list({ limit: 20 });

    expect(result.items[0].connectivityStatus).toBe('offline');
    expect(result.items[0].latestReading).toBeNull();
    expect(result.items[0].autonomyKm).toBeNull();
  });
});

describe('DevicesService.detail', () => {
  test('throws NotFoundException for an unknown id', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindUnique.mockResolvedValueOnce(null);

    await expect(service.detail('missing')).rejects.toThrow(NotFoundException);
  });

  test('includes only unacknowledged alerts', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindUnique.mockResolvedValueOnce({
      ...DEVICE,
      alerts: [
        {
          id: 'alert-1',
          type: 'LOW_FUEL',
          severity: 'WARNING',
          predictedEmptyAt: null,
          distanceRemainingKm: 40,
          createdAt: new Date('2026-08-23T11:00:00.000Z'),
        },
      ],
    });

    const result = await service.detail(DEVICE.id);

    expect(result.activeAlerts).toHaveLength(1);
    expect(result.activeAlerts[0].id).toBe('alert-1');
    expect(prisma.deviceFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          alerts: expect.objectContaining({ where: { acknowledgedAt: null } }),
        }),
      }),
    );
  });
});

describe('DevicesService.history', () => {
  test('throws NotFoundException for an unknown device', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindUnique.mockResolvedValueOnce(null);

    await expect(
      service.history('missing', {
        from: new Date(),
        to: new Date(Date.now() + 1000),
        bucketSeconds: 300,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  test('coerces numeric-string aggregates from Postgres into numbers', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindUnique.mockResolvedValueOnce({ id: DEVICE.id });
    prisma.queryRaw.mockResolvedValueOnce([
      {
        bucket: new Date('2026-08-23T12:00:00.000Z'),
        avgFuelLevelPct: '45.5',
        avgSpeedKph: '38.2',
        maxSpeedKph: '90',
      },
    ]);

    const result = await service.history(DEVICE.id, {
      from: new Date('2026-08-23T00:00:00.000Z'),
      to: new Date('2026-08-23T23:59:59.000Z'),
      bucketSeconds: 300,
    });

    expect(result).toEqual([
      {
        bucket: '2026-08-23T12:00:00.000Z',
        avgFuelLevelPct: 45.5,
        avgSpeedKph: 38.2,
        maxSpeedKph: 90,
      },
    ]);
  });
});

describe('DevicesService.update', () => {
  test('throws NotFoundException for an unknown id', async () => {
    const { service, prisma } = buildService();
    prisma.deviceFindUnique.mockResolvedValueOnce(null);

    await expect(service.update('missing', { plate: 'X' })).rejects.toThrow(NotFoundException);
    expect(prisma.deviceUpdate).not.toHaveBeenCalled();
  });

  test('updates only the provided fields, then returns the fresh detail', async () => {
    const { service, prisma } = buildService();

    await service.update(DEVICE.id, { tankCapacityL: 70 });

    expect(prisma.deviceUpdate).toHaveBeenCalledWith({
      where: { id: DEVICE.id },
      data: { plate: undefined, tankCapacityL: 70, status: undefined },
    });
  });
});
