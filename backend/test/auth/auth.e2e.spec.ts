import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { hashPassword } from '../../../shared/password';

// Esta suite ejercita la capa HTTP real (guards, cookies, rate limiting,
// rotación de refresh) de punta a punta contra una instancia real de
// Postgres, siguiendo la convención de e2e ya existente en este repo (fetch
// nativo + una instancia efímera de app.listen(0)) en vez de sumar
// supertest como nueva dependencia.
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const email = `auth-e2e-${Date.now()}@fleet.demo`;
  const password = 'Correct Horse Battery Staple 1';
  const viewerEmail = `auth-e2e-viewer-${Date.now()}@fleet.demo`;
  let userId: string;
  let viewerId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'auth-e2e-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
    prisma = app.get(PrismaService);

    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role: 'ADMIN' },
    });
    userId = user.id;

    const viewer = await prisma.user.create({
      data: { email: viewerEmail, passwordHash: await hashPassword(password), role: 'VIEWER' },
    });
    viewerId = viewer.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [userId, viewerId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, viewerId] } } });
    const httpServer = app.getHttpServer();
    await app.close();
    httpServer.closeAllConnections?.();
  });

  function extractCookie(res: Response, name: string): string | undefined {
    const raw = res.headers.get('set-cookie');
    if (!raw) return undefined;
    const match = raw.split(';')[0].split('=');
    return match[0] === name ? match.slice(1).join('=') : undefined;
  }

  interface LoginResponseBody {
    accessToken?: string;
    user?: { id: string; email: string; role: string };
    message?: string;
  }

  async function login(
    loginEmail: string,
    loginPassword: string,
  ): Promise<{ res: Response; body: LoginResponseBody; refreshCookie: string | undefined }> {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    const body = (await res.json()) as LoginResponseBody;
    return { res, body, refreshCookie: extractCookie(res, 'refreshToken') };
  }

  test('login with correct credentials returns 200, an access token, and sets the refresh cookie', async () => {
    const { res, body, refreshCookie } = await login(email, password);

    expect(res.status).toBe(200);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user).toEqual({ id: userId, email, role: 'ADMIN' });
    expect(refreshCookie).toBeTruthy();

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Path=\/api\/v1\/auth/i);
  });

  test('login with the wrong password returns 401', async () => {
    const { res, body } = await login(email, 'not the right password');

    expect(res.status).toBe(401);
    expect(body.message).toBeTruthy();
  });

  test('a request without a token is rejected with 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`);

    expect(res.status).toBe(401);
  });

  test('GET /me hydrates the session from a valid access token', async () => {
    const { body } = await login(email, password);

    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });
    const me = await res.json();

    expect(res.status).toBe(200);
    expect(me).toEqual({ id: userId, email, role: 'ADMIN' });
  });

  test('a VIEWER token is rejected with 403 on an ADMIN-only endpoint', async () => {
    const { body } = await login(viewerEmail, password);

    const res = await fetch(`${baseUrl}/api/v1/sim/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });

    expect(res.status).toBe(403);
  });

  test('reusing a rotated refresh token revokes the whole family', async () => {
    const { refreshCookie: originalCookie } = await login(email, password);
    expect(originalCookie).toBeTruthy();

    const firstRefresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refreshToken=${originalCookie}` },
    });
    expect(firstRefresh.status).toBe(200);
    const rotatedCookie = extractCookie(firstRefresh, 'refreshToken');
    expect(rotatedCookie).toBeTruthy();
    expect(rotatedCookie).not.toBe(originalCookie);

    // reusar la cookie original ya obsoleta debe ser rechazado...
    const reuse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refreshToken=${originalCookie}` },
    });
    expect(reuse.status).toBe(401);

    // ...y también debe haber quemado al descendiente legítimo (revocación de familia)
    const afterReuse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `refreshToken=${rotatedCookie}` },
    });
    expect(afterReuse.status).toBe(401);
  });

  test('logout is idempotent: two consecutive calls both return 200', async () => {
    const { body, refreshCookie } = await login(email, password);

    const first = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${body.accessToken}`,
        cookie: `refreshToken=${refreshCookie}`,
      },
    });
    const second = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${body.accessToken}`,
        cookie: `refreshToken=${refreshCookie}`,
      },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
