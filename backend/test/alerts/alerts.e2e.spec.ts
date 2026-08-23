import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { sign } from '../../../shared/jwt';

const JWT_SECRET = 'alerts-e2e-secret';

describe('Alerts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let deviceId: string;
  let adminAId: string;
  let adminBId: string;
  const publicId = `DEV-${Date.now()}-ALRT`;
  const plate = `ALRT${Date.now()}`;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;

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

    // Alert.acknowledgedBy has a real FK to User.id, so the ack tests need
    // real rows to point at - a bare JWT sub with no backing row would
    // trip the FK constraint on the conditional UPDATE.
    const adminA = await prisma.user.create({
      data: { email: `alerts-e2e-a-${Date.now()}@fleet.demo`, passwordHash: 'x', role: 'ADMIN' },
    });
    const adminB = await prisma.user.create({
      data: { email: `alerts-e2e-b-${Date.now()}@fleet.demo`, passwordHash: 'x', role: 'ADMIN' },
    });
    adminAId = adminA.id;
    adminBId = adminB.id;
  });

  afterAll(async () => {
    await prisma.alert.deleteMany({ where: { deviceId } });
    await prisma.device.delete({ where: { id: deviceId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminAId, adminBId] } } });
    const httpServer = app.getHttpServer();
    await app.close();
    httpServer.closeAllConnections?.();
  });

  function token(role: string, sub = `user-${role}`): string {
    return sign({ sub, role }, JWT_SECRET, 60);
  }

  async function call(
    method: string,
    path: string,
    role: string,
    opts: { sub?: string; idempotencyKey?: string } = {},
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token(role, opts.sub)}` };
    if (opts.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey;
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers });
    return { status: res.status, body: await res.json() };
  }

  async function createAlert(overrides: Partial<{ acknowledgedAt: Date | null }> = {}) {
    return prisma.alert.create({
      data: {
        deviceId,
        type: 'LOW_FUEL',
        severity: 'WARNING',
        predictedEmptyAt: new Date(Date.now() + 40 * 60_000),
        distanceRemainingKm: 40,
        ...overrides,
      },
    });
  }

  test('a VIEWER receives 403, not an empty list, on GET /alerts', async () => {
    const res = await call('GET', '/api/v1/alerts', 'VIEWER');
    expect(res.status).toBe(403);
  });

  test('a VIEWER receives 403 on POST /alerts/:id/ack', async () => {
    const alert = await createAlert();
    const res = await call('POST', `/api/v1/alerts/${alert.id}/ack`, 'VIEWER');
    expect(res.status).toBe(403);
  });

  test('a VIEWER receives 403, not an empty list, on GET /devices/:id/alerts', async () => {
    const res = await call('GET', `/api/v1/devices/${deviceId}/alerts`, 'VIEWER');
    expect(res.status).toBe(403);
  });

  test('GET /alerts?status=active only returns unacknowledged alerts for an ADMIN', async () => {
    const active = await createAlert();
    const acked = await createAlert({ acknowledgedAt: new Date() });

    // The default page (limit=20, oldest first) can't be trusted to contain
    // a just-created alert once the shared dev DB has accumulated more than
    // a page of active alerts from other runs - walk every page instead of
    // assuming page 1.
    const ids = new Set<string>();
    let cursor: string | undefined;
    do {
      const path = cursor
        ? `/api/v1/alerts?status=active&cursor=${encodeURIComponent(cursor)}`
        : '/api/v1/alerts?status=active';
      const res = await call('GET', path, 'ADMIN', { sub: adminAId });
      expect(res.status).toBe(200);
      const body = res.body as { items: { id: string }[]; nextCursor: string | null };
      body.items.forEach((item) => ids.add(item.id));
      cursor = body.nextCursor ?? undefined;
    } while (cursor);

    expect(ids.has(active.id)).toBe(true);
    expect(ids.has(acked.id)).toBe(false);
  });

  test('GET /devices/:id/alerts returns the alert history with predicted autonomy for an ADMIN', async () => {
    const alert = await createAlert();

    const res = await call('GET', `/api/v1/devices/${deviceId}/alerts`, 'ADMIN', {
      sub: adminAId,
    });
    const body = res.body as {
      items: { id: string; distanceRemainingKm: number | null; predictedEmptyAt: string | null }[];
    };

    expect(res.status).toBe(200);
    const found = body.items.find((a) => a.id === alert.id);
    expect(found).toBeDefined();
    expect(found?.distanceRemainingKm).toBe(40);
    expect(found?.predictedEmptyAt).not.toBeNull();
  });

  test('ADMIN acknowledges an active alert: 200, with acknowledgedAt/acknowledgedBy set', async () => {
    const alert = await createAlert();

    const res = await call('POST', `/api/v1/alerts/${alert.id}/ack`, 'ADMIN', { sub: adminAId });
    const body = res.body as { acknowledgedAt: string | null; acknowledgedBy: string | null };

    expect(res.status).toBe(200);
    expect(body.acknowledgedAt).not.toBeNull();
    expect(body.acknowledgedBy).toBe(adminAId);
  });

  test('acknowledging an already-acked alert returns 409 with the current state in the body', async () => {
    const alert = await createAlert();
    await call('POST', `/api/v1/alerts/${alert.id}/ack`, 'ADMIN', { sub: adminAId });

    const second = await call('POST', `/api/v1/alerts/${alert.id}/ack`, 'ADMIN', {
      sub: adminBId,
    });
    const body = second.body as { acknowledgedBy: string | null };

    expect(second.status).toBe(409);
    expect(body.acknowledgedBy).toBe(adminAId);
  });

  test('a retried ack with the same Idempotency-Key as the winning request replays 200, not 409', async () => {
    const alert = await createAlert();
    const key = 'ack-retry-key-1';

    const first = await call('POST', `/api/v1/alerts/${alert.id}/ack`, 'ADMIN', {
      sub: adminAId,
      idempotencyKey: key,
    });
    expect(first.status).toBe(200);

    const retry = await call('POST', `/api/v1/alerts/${alert.id}/ack`, 'ADMIN', {
      sub: adminAId,
      idempotencyKey: key,
    });
    expect(retry.status).toBe(200);
  });

  test('two admins acknowledging the same alert concurrently produce exactly one 200 and one 409', async () => {
    const alert = await createAlert();

    const [resA, resB] = await Promise.all([
      call('POST', `/api/v1/alerts/${alert.id}/ack`, 'ADMIN', { sub: adminAId }),
      call('POST', `/api/v1/alerts/${alert.id}/ack`, 'ADMIN', { sub: adminBId }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const stored = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect([adminAId, adminBId]).toContain(stored.acknowledgedBy);
  });
});
