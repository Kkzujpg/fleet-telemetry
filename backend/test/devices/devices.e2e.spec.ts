import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { sign } from '../../../shared/jwt';
import { maskDeviceId } from '../../../shared/mask';

const JWT_SECRET = 'devices-e2e-secret';

function token(role: string): string {
  return sign({ sub: `user-${role}`, role }, JWT_SECRET, 60);
}

describe('Devices masking (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let deviceId: string;
  const publicId = `DEV-${Date.now()}-MSK1`;
  const plate = `E2E${Date.now()}`;

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
  });

  afterAll(async () => {
    await prisma.telemetryReading.deleteMany({ where: { deviceId } });
    await prisma.device.delete({ where: { id: deviceId } });
    const httpServer = app.getHttpServer();
    await app.close();
    httpServer.closeAllConnections?.();
  });

  async function get(path: string, role: string): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token(role)}` },
    });
    return { status: res.status, body: await res.json() };
  }

  test('VIEWER sees a masked publicId in the devices list; ADMIN sees the full id', async () => {
    const viewerRes = await get(`/api/v1/devices?q=${plate}`, 'VIEWER');
    const adminRes = await get(`/api/v1/devices?q=${plate}`, 'ADMIN');

    const viewerItem = (viewerRes.body as { items: { publicId: string }[] }).items[0];
    const adminItem = (adminRes.body as { items: { publicId: string }[] }).items[0];

    expect(viewerItem.publicId).toBe(maskDeviceId(publicId));
    expect(viewerItem.publicId).not.toBe(publicId);
    expect(adminItem.publicId).toBe(publicId);
  });

  test('VIEWER sees a masked publicId in the device detail; ADMIN sees the full id', async () => {
    const viewerRes = await get(`/api/v1/devices/${deviceId}`, 'VIEWER');
    const adminRes = await get(`/api/v1/devices/${deviceId}`, 'ADMIN');

    expect((viewerRes.body as { publicId: string }).publicId).toBe(maskDeviceId(publicId));
    expect((adminRes.body as { publicId: string }).publicId).toBe(publicId);
  });

  test('OPERATOR is also masked (masking is role-based, not just VIEWER-specific)', async () => {
    const operatorRes = await get(`/api/v1/devices/${deviceId}`, 'OPERATOR');
    expect((operatorRes.body as { publicId: string }).publicId).toBe(maskDeviceId(publicId));
  });

  test('PATCH is rejected for a non-ADMIN role', async () => {
    const res = await fetch(`${baseUrl}/api/v1/devices/${deviceId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token('OPERATOR')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ plate: 'SHOULD-NOT-APPLY' }),
    });
    expect(res.status).toBe(403);
  });

  test('PATCH by ADMIN updates the device', async () => {
    const newPlate = `${plate}-B`;
    const res = await fetch(`${baseUrl}/api/v1/devices/${deviceId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token('ADMIN')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ plate: newPlate }),
    });
    const body = (await res.json()) as { plate: string };

    expect(res.status).toBe(200);
    expect(body.plate).toBe(newPlate);
  });
});
