import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { hashPassword } from '../../../shared/password';

// Mobile has no browser cookie jar, so this flow returns the refresh token in
// the JSON body instead of a Set-Cookie header. It is a deliberately separate
// endpoint family (never reads the `refreshToken` cookie) so that an XSS on
// the web app cannot call it to exfiltrate a session established via the
// httpOnly cookie - see auth.controller.ts for the mobile handlers.
describe('Auth mobile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const email = `auth-mobile-e2e-${Date.now()}@fleet.demo`;
  const password = 'Correct Horse Battery Staple 1';
  let userId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'auth-mobile-e2e-secret';

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
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    const httpServer = app.getHttpServer();
    await app.close();
    httpServer.closeAllConnections?.();
  });

  interface MobileLoginBody {
    accessToken?: string;
    refreshToken?: string;
    user?: { id: string; email: string; role: string };
    message?: string;
  }

  async function mobileLogin(): Promise<MobileLoginBody> {
    const res = await fetch(`${baseUrl}/api/v1/auth/mobile/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as MobileLoginBody;
  }

  test('mobile login returns the refresh token in the body, not a cookie', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/mobile/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = (await res.json()) as MobileLoginBody;

    expect(res.status).toBe(200);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.user).toEqual({ id: userId, email, role: 'ADMIN' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test('mobile refresh rotates the token and returns the new one in the body', async () => {
    const first = await mobileLogin();

    const res = await fetch(`${baseUrl}/api/v1/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: first.refreshToken }),
    });
    const body = (await res.json()) as MobileLoginBody;

    expect(res.status).toBe(200);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.refreshToken).not.toBe(first.refreshToken);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test('reusing a rotated mobile refresh token is rejected with 401', async () => {
    const first = await mobileLogin();

    await fetch(`${baseUrl}/api/v1/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: first.refreshToken }),
    });

    const reuse = await fetch(`${baseUrl}/api/v1/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: first.refreshToken }),
    });

    expect(reuse.status).toBe(401);
  });

  test('the web cookie-based /auth/refresh endpoint ignores a refresh token passed in the body', async () => {
    const mobile = await mobileLogin();

    // No `cookie` header sent - only a (spoofed) body field, mimicking what an
    // XSS on the web app could control. It must not be honoured.
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: mobile.refreshToken }),
    });

    expect(res.status).toBe(401);
  });

  test('mobile logout requires a bearer token and revokes the given refresh token', async () => {
    const mobile = await mobileLogin();

    const res = await fetch(`${baseUrl}/api/v1/auth/mobile/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${mobile.accessToken}`,
      },
      body: JSON.stringify({ refreshToken: mobile.refreshToken }),
    });
    expect(res.status).toBe(200);

    const afterLogout = await fetch(`${baseUrl}/api/v1/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: mobile.refreshToken }),
    });
    expect(afterLogout.status).toBe(401);
  });

  test('mobile logout without a bearer token is rejected with 401', async () => {
    const mobile = await mobileLogin();

    const res = await fetch(`${baseUrl}/api/v1/auth/mobile/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: mobile.refreshToken }),
    });

    expect(res.status).toBe(401);
  });
});
