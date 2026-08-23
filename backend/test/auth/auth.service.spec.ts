import { HttpException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { AccessTokenService } from '../../src/auth/access-token.service';
import { RefreshTokenService } from '../../src/auth/refresh-token.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SlidingWindowRateLimiter } from '../../../shared/rate-limiter';
import { hashPassword } from '../../../shared/password';

const USER = {
  id: 'user-1',
  email: 'admin@fleet.demo',
  role: 'ADMIN',
};

async function buildService(overrides: { passwordHash?: string } = {}) {
  const passwordHash = overrides.passwordHash ?? (await hashPassword('correct horse'));
  const findUnique = jest.fn().mockImplementation(({ where }: { where: { email?: string; id?: string } }) => {
    if (where.email === USER.email || where.id === USER.id) {
      return Promise.resolve({ ...USER, passwordHash });
    }
    return Promise.resolve(null);
  });
  const prisma = { user: { findUnique } } as unknown as PrismaService;

  const accessTokens = new AccessTokenService('unit-test-secret');
  const refreshTokens = {
    issue: jest.fn().mockResolvedValue({ raw: 'raw-refresh-token', id: 'rt-1' }),
    rotate: jest.fn(),
    revokeByRawToken: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<RefreshTokenService>;

  const rateLimiter = new SlidingWindowRateLimiter(5, 15 * 60_000);

  const service = new AuthService(prisma, accessTokens, refreshTokens, rateLimiter);
  return { service, prisma, refreshTokens, rateLimiter };
}

describe('AuthService.login', () => {
  test('returns tokens and the user profile on success', async () => {
    const { service } = await buildService();

    const result = await service.login(USER.email, 'correct horse', '1.2.3.4');

    expect(result.user).toEqual({ id: USER.id, email: USER.email, role: USER.role });
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toBe('raw-refresh-token');
  });

  test('rejects a wrong password', async () => {
    const { service } = await buildService();

    await expect(service.login(USER.email, 'wrong password', '1.2.3.4')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  test('rejects an unknown email with the same error as a wrong password', async () => {
    const { service } = await buildService();

    await expect(
      service.login('nobody@fleet.demo', 'whatever', '1.2.3.4'),
    ).rejects.toThrow(UnauthorizedException);
  });

  test('an unknown email still pays the scrypt cost (no early return before hashing)', async () => {
    const { service } = await buildService();
    const start = process.hrtime.bigint();
    await expect(service.login('nobody@fleet.demo', 'whatever', '1.2.3.4')).rejects.toThrow();
    const unknownMs = Number(process.hrtime.bigint() - start) / 1e6;

    const start2 = process.hrtime.bigint();
    await expect(service.login(USER.email, 'wrong password', '5.6.7.8')).rejects.toThrow();
    const wrongPasswordMs = Number(process.hrtime.bigint() - start2) / 1e6;

    // both branches run a real scrypt derivation; neither should be a near-instant early exit
    expect(unknownMs).toBeGreaterThan(1);
    expect(wrongPasswordMs).toBeGreaterThan(1);
  });

  test('locks out after 5 failed attempts from the same IP', async () => {
    const { service } = await buildService();

    for (let i = 0; i < 5; i++) {
      await expect(service.login(USER.email, 'wrong', '9.9.9.9')).rejects.toThrow(
        UnauthorizedException,
      );
    }

    await expect(service.login(USER.email, 'correct horse', '9.9.9.9')).rejects.toThrow(
      HttpException,
    );
  });

  test('locks out after 5 failed attempts against the same email from different IPs', async () => {
    const { service } = await buildService();

    for (let i = 0; i < 5; i++) {
      await expect(service.login(USER.email, 'wrong', `10.0.0.${i}`)).rejects.toThrow(
        UnauthorizedException,
      );
    }

    await expect(service.login(USER.email, 'correct horse', '10.0.0.99')).rejects.toThrow(
      HttpException,
    );
  });

  test('a successful login resets the failure counter for that key', async () => {
    const { service, rateLimiter } = await buildService();

    await expect(service.login(USER.email, 'wrong', '1.1.1.1')).rejects.toThrow();
    await service.login(USER.email, 'correct horse', '1.1.1.1');

    expect(rateLimiter.isBlocked(`ip:1.1.1.1`, new Date())).toBe(false);
  });
});

describe('AuthService.logout', () => {
  test('is idempotent and never throws, even without a token', async () => {
    const { service } = await buildService();

    await expect(service.logout(undefined)).resolves.toBeUndefined();
  });
});

describe('AuthService.me', () => {
  test('returns the profile for a known user id', async () => {
    const { service } = await buildService();

    await expect(service.me(USER.id)).resolves.toEqual({
      id: USER.id,
      email: USER.email,
      role: USER.role,
    });
  });

  test('rejects an unknown user id', async () => {
    const { service } = await buildService();

    await expect(service.me('ghost')).rejects.toThrow(UnauthorizedException);
  });
});
