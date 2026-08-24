import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { RefreshTokenService } from './refresh-token.service';
import { hashPassword, verifyPassword } from '../../../shared/password';
import { SlidingWindowRateLimiter } from '../../../shared/rate-limiter';
import { LOGIN_RATE_LIMITER } from './login-rate-limiter.token';

export interface UserProfile {
  id: string;
  email: string;
  role: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  // Precalculado una vez para que un email desconocido igual pague el costo
  // real de scrypt con el mismo N/r/p que un hash genuino - nunca un retorno
  // temprano barato que dejaría que el timing de la respuesta revele qué
  // emails están registrados.
  private readonly dummyHash: Promise<string> = hashPassword(randomBytes(32).toString('hex'));

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    @Inject(LOGIN_RATE_LIMITER) private readonly rateLimiter: SlidingWindowRateLimiter,
  ) {}

  async login(email: string, password: string, ip: string): Promise<LoginResult> {
    const now = new Date();
    const ipKey = `ip:${ip}`;
    const emailKey = `email:${email}`;

    if (this.rateLimiter.isBlocked(ipKey, now) || this.rateLimiter.isBlocked(emailKey, now)) {
      throw new HttpException('too many failed login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordOk = await verifyPassword(password, user ? user.passwordHash : await this.dummyHash);

    if (!user || !passwordOk) {
      this.rateLimiter.recordFailure(ipKey, now);
      this.rateLimiter.recordFailure(emailKey, now);
      throw new UnauthorizedException('invalid email or password');
    }

    this.rateLimiter.reset(ipKey);
    this.rateLimiter.reset(emailKey);

    const accessToken = this.accessTokens.sign({ sub: user.id, role: user.role });
    const issued = await this.refreshTokens.issue(user.id);

    return {
      accessToken,
      refreshToken: issued.raw,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async refresh(rawRefreshToken: string | undefined): Promise<RefreshResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('missing refresh token');
    }

    const { userId, issued } = await this.refreshTokens.rotate(rawRefreshToken);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('user no longer exists');
    }

    return {
      accessToken: this.accessTokens.sign({ sub: user.id, role: user.role }),
      refreshToken: issued.raw,
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) {
      await this.refreshTokens.revokeByRawToken(rawRefreshToken);
    }
  }

  async me(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('user no longer exists');
    }
    return { id: user.id, email: user.email, role: user.role };
  }
}
