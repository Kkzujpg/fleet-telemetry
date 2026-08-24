import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  generateRefreshToken,
  hashRefreshToken,
  assertRefreshTokenUsable,
  RefreshTokenReuseError,
  RefreshTokenExpiredError,
} from '../../../shared/refresh-token';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface IssuedRefreshToken {
  raw: string;
  id: string;
}

export interface RotatedRefreshToken {
  userId: string;
  issued: IssuedRefreshToken;
}

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string): Promise<IssuedRefreshToken> {
    const raw = generateRefreshToken();
    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(raw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return { raw, id: record.id };
  }

  /** Verifica y rota un refresh token. Un token reusado (ya rotado) revoca toda su familia. */
  async rotate(rawToken: string): Promise<RotatedRefreshToken> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
    });
    if (!record) {
      throw new UnauthorizedException('invalid refresh token');
    }

    try {
      assertRefreshTokenUsable(record, new Date());
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        await this.revokeFamily(record.id);
      }
      if (error instanceof RefreshTokenReuseError || error instanceof RefreshTokenExpiredError) {
        throw new UnauthorizedException('refresh token no longer valid');
      }
      throw error;
    }

    const issued = await this.issue(record.userId);
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedById: issued.id },
    });

    return { userId: record.userId, issued };
  }

  async revokeByRawToken(rawToken: string): Promise<void> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
    });
    if (record) {
      await this.revokeFamily(record.id);
    }
  }

  private async revokeFamily(tokenId: string): Promise<void> {
    let current = await this.prisma.refreshToken.findUnique({ where: { id: tokenId } });
    while (current) {
      if (!current.revokedAt) {
        await this.prisma.refreshToken.update({
          where: { id: current.id },
          data: { revokedAt: new Date() },
        });
      }
      current = current.replacedById
        ? await this.prisma.refreshToken.findUnique({ where: { id: current.replacedById } })
        : null;
    }
  }
}
