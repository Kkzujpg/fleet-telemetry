import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { sign } from '../../../shared/jwt';
import { maskDeviceId } from '../../../shared/mask';

describe('Telemetry idempotency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let deviceId: string;
  const publicId = `DEV-${Date.now()}-IDEM`;
  const plate = `IDEM${Date.now()}`;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'telemetry-e2e-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
    prisma = app.get(PrismaService);

    const device = await prisma.device.create({
      data: { publicId, plate, tankCapacityL: 50, status: 'ACTIVE' },
    });
    deviceId = device.id;
  });

  afterAll(async () => {
    await prisma.telemetryReading.deleteMany({ where: { deviceId } });
    await prisma.device.delete({ where: { id: deviceId } });
    const httpServer = app.getHttpServer();
    await app.close();
    httpServer.closeAllConnections?.();
  });

  function reading(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      devicePublicId: publicId,
      recordedAt: new Date().toISOString(),
      lat: 4.6,
      lng: -74.1,
      speedKph: 35,
      fuelLevelPct: 60,
      engineTempC: 87,
      odometerKm: 500,
      ...overrides,
    };
  }

  async function post(
    body: unknown,
    idempotencyKey?: string,
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const res = await fetch(`${baseUrl}/api/v1/telemetry`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  test('a retried POST with the same Idempotency-Key returns 200 duplicate:true and never inserts a second row', async () => {
    const body = reading();
    const key = 'idem-key-1';

    const first = await post(body, key);
    expect(first.status).toBe(201);
    expect((first.body as { duplicate: boolean }).duplicate).toBe(false);

    const second = await post(body, key);
    expect(second.status).toBe(200);
    expect((second.body as { duplicate: boolean }).duplicate).toBe(true);
    expect((second.body as { reading: { id: string } }).reading.id).toBe(
      (first.body as { reading: { id: string } }).reading.id,
    );

    const count = await prisma.telemetryReading.count({ where: { deviceId } });
    expect(count).toBe(1);
  });

  test('a retry with the same (deviceId, recordedAt) but no header is still idempotent', async () => {
    const body = reading({ recordedAt: new Date().toISOString() });

    const first = await post(body);
    expect(first.status).toBe(201);

    const second = await post(body);
    expect(second.status).toBe(200);
    expect((second.body as { duplicate: boolean }).duplicate).toBe(true);

    const count = await prisma.telemetryReading.count({
      where: { deviceId, recordedAt: new Date(body.recordedAt as string) },
    });
    expect(count).toBe(1);
  });

  test('the reconciliation endpoint also masks the nested device.publicId for a non-ADMIN role', async () => {
    await post(reading());

    const res = await fetch(`${baseUrl}/api/v1/telemetry?deviceIds=${deviceId}`, {
      headers: {
        Authorization: `Bearer ${sign({ sub: 'viewer-1', role: 'VIEWER' }, 'telemetry-e2e-secret', 60)}`,
      },
    });
    const body = (await res.json()) as { readings: { device: { publicId: string } }[] };

    expect(body.readings.length).toBeGreaterThan(0);
    for (const r of body.readings) {
      expect(r.device.publicId).not.toBe(publicId);
      expect(r.device.publicId).toBe(maskDeviceId(publicId));
    }
  });

  test('rejects a recordedAt more than 5 minutes in the future with 400, never 500', async () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    const res = await post(reading({ recordedAt: future }));
    expect(res.status).toBe(400);
  });

  test('rejects an out-of-range fuelLevelPct with 400, never 500', async () => {
    const res = await post(reading({ fuelLevelPct: 150 }));
    expect(res.status).toBe(400);
  });
});
