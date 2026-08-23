import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from '../../src/auth/refresh-token.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { hashRefreshToken } from '../../../shared/refresh-token';

interface StoredToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

function buildFakePrisma(): { prisma: PrismaService; rows: Map<string, StoredToken> } {
  const rows = new Map<string, StoredToken>();
  let counter = 0;

  const refreshToken = {
    create: jest.fn().mockImplementation(({ data }: { data: Partial<StoredToken> }) => {
      counter += 1;
      const row: StoredToken = {
        id: `rt-${counter}`,
        userId: data.userId as string,
        tokenHash: data.tokenHash as string,
        expiresAt: data.expiresAt as Date,
        revokedAt: null,
        replacedById: null,
      };
      rows.set(row.id, row);
      return Promise.resolve(row);
    }),
    findUnique: jest.fn().mockImplementation(({ where }: { where: { id?: string; tokenHash?: string } }) => {
      if (where.id) {
        return Promise.resolve(rows.get(where.id) ?? null);
      }
      const found = [...rows.values()].find((r) => r.tokenHash === where.tokenHash);
      return Promise.resolve(found ?? null);
    }),
    update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Partial<StoredToken> }) => {
      const row = rows.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return Promise.resolve(row);
    }),
  };

  const prisma = { refreshToken } as unknown as PrismaService;
  return { prisma, rows };
}

describe('RefreshTokenService', () => {
  test('issue() stores a hashed token, never the raw value', async () => {
    const { prisma, rows } = buildFakePrisma();
    const service = new RefreshTokenService(prisma);

    const issued = await service.issue('user-1');

    const stored = rows.get(issued.id);
    expect(stored?.tokenHash).toBe(hashRefreshToken(issued.raw));
    expect(stored?.tokenHash).not.toBe(issued.raw);
  });

  test('rotate() issues a new token and revokes the old one', async () => {
    const { prisma, rows } = buildFakePrisma();
    const service = new RefreshTokenService(prisma);
    const issued = await service.issue('user-1');

    const rotated = await service.rotate(issued.raw);

    expect(rotated.userId).toBe('user-1');
    expect(rotated.issued.raw).not.toBe(issued.raw);

    const oldRow = rows.get(issued.id)!;
    expect(oldRow.revokedAt).not.toBeNull();
    expect(oldRow.replacedById).toBe(rotated.issued.id);
  });

  test('rotate() rejects an unknown token', async () => {
    const { prisma } = buildFakePrisma();
    const service = new RefreshTokenService(prisma);

    await expect(service.rotate('does-not-exist')).rejects.toThrow(UnauthorizedException);
  });

  test('rotate() rejects an expired token', async () => {
    const { prisma, rows } = buildFakePrisma();
    const service = new RefreshTokenService(prisma);
    const issued = await service.issue('user-1');
    rows.get(issued.id)!.expiresAt = new Date(Date.now() - 1_000);

    await expect(service.rotate(issued.raw)).rejects.toThrow(UnauthorizedException);
  });

  test('reusing an already-rotated token revokes the entire family', async () => {
    const { prisma, rows } = buildFakePrisma();
    const service = new RefreshTokenService(prisma);
    const first = await service.issue('user-1');
    const second = await service.rotate(first.raw);

    await expect(service.rotate(first.raw)).rejects.toThrow(UnauthorizedException);

    // the descendant issued by the legitimate rotation must also be dead now
    expect(rows.get(second.issued.id)!.revokedAt).not.toBeNull();
    await expect(service.rotate(second.issued.raw)).rejects.toThrow(UnauthorizedException);
  });

  test('revokeByRawToken() is a no-op for an unknown token (idempotent logout)', async () => {
    const { prisma } = buildFakePrisma();
    const service = new RefreshTokenService(prisma);

    await expect(service.revokeByRawToken('never-issued')).resolves.toBeUndefined();
  });

  test('revokeByRawToken() revokes the token and its family', async () => {
    const { prisma, rows } = buildFakePrisma();
    const service = new RefreshTokenService(prisma);
    const issued = await service.issue('user-1');

    await service.revokeByRawToken(issued.raw);

    expect(rows.get(issued.id)!.revokedAt).not.toBeNull();
    await expect(service.rotate(issued.raw)).rejects.toThrow(UnauthorizedException);
  });
});
