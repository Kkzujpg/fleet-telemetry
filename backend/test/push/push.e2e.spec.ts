import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { hashPassword } from '../../../shared/password';

describe('Push (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const email = `push-e2e-${Date.now()}@fleet.demo`;
  const password = 'Correct Horse Battery Staple 1';
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'push-e2e-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
    prisma = app.get(PrismaService);

    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role: 'OPERATOR' },
    });
    userId = user.id;

    const loginRes = await fetch(`${baseUrl}/api/v1/auth/mobile/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = (await loginRes.json()) as { accessToken: string };
    accessToken = loginBody.accessToken;
  });

  afterAll(async () => {
    await prisma.pushToken.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    const httpServer = app.getHttpServer();
    await app.close();
    httpServer.closeAllConnections?.();
  });

  test('registers a push token for the authenticated user', async () => {
    const res = await fetch(`${baseUrl}/api/v1/push/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ expoPushToken: 'ExponentPushToken[e2e-test-token]', platform: 'android' }),
    });

    expect(res.status).toBe(200);

    const stored = await prisma.pushToken.findUnique({
      where: { expoPushToken: 'ExponentPushToken[e2e-test-token]' },
    });
    expect(stored).toMatchObject({ userId, platform: 'android' });
  });

  test('re-registering the same token updates it instead of duplicating', async () => {
    const token = 'ExponentPushToken[e2e-upsert-token]';
    await fetch(`${baseUrl}/api/v1/push/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ expoPushToken: token, platform: 'android' }),
    });
    await fetch(`${baseUrl}/api/v1/push/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ expoPushToken: token, platform: 'ios' }),
    });

    const rows = await prisma.pushToken.findMany({ where: { expoPushToken: token } });
    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBe('ios');
  });

  test('rejects registration without a bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/v1/push/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expoPushToken: 'ExponentPushToken[unauth]', platform: 'android' }),
    });

    expect(res.status).toBe(401);
  });

  test('rejects a malformed token', async () => {
    const res = await fetch(`${baseUrl}/api/v1/push/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ expoPushToken: 'not-a-token', platform: 'android' }),
    });

    expect(res.status).toBe(400);
  });
});
