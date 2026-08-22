import { createHash, randomBytes } from "node:crypto";

export class RefreshTokenReuseError extends Error {}
export class RefreshTokenExpiredError extends Error {}

export interface RefreshTokenRecord {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

const TOKEN_BYTES = 32;

export function generateRefreshToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function assertRefreshTokenUsable(
  record: RefreshTokenRecord,
  now: Date,
): void {
  if (record.revokedAt !== null) {
    throw new RefreshTokenReuseError(
      `refresh token ${record.id} was already used or revoked (possible token theft)`,
    );
  }
  if (record.expiresAt <= now) {
    throw new RefreshTokenExpiredError(
      `refresh token ${record.id} has expired`,
    );
  }
}
