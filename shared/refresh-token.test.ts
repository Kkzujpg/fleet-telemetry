import {
  generateRefreshToken,
  hashRefreshToken,
  assertRefreshTokenUsable,
  RefreshTokenReuseError,
  RefreshTokenExpiredError,
  RefreshTokenRecord,
} from "./refresh-token";

function record(
  overrides: Partial<RefreshTokenRecord> = {},
): RefreshTokenRecord {
  return {
    id: "rt-1",
    tokenHash: "irrelevant-for-this-check",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedById: null,
    ...overrides,
  };
}

describe("generateRefreshToken", () => {
  test("produces a high-entropy, url-safe token", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();

    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashRefreshToken", () => {
  test("is deterministic for the same token", () => {
    const token = generateRefreshToken();

    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  test("differs across distinct tokens", () => {
    expect(hashRefreshToken("token-a")).not.toBe(hashRefreshToken("token-b"));
  });
});

describe("assertRefreshTokenUsable", () => {
  test("allows a fresh, unrevoked, unexpired token", () => {
    expect(() => assertRefreshTokenUsable(record(), new Date())).not.toThrow();
  });

  test("throws RefreshTokenExpiredError once past expiresAt", () => {
    const expired = record({ expiresAt: new Date(Date.now() - 1_000) });

    expect(() => assertRefreshTokenUsable(expired, new Date())).toThrow(
      RefreshTokenExpiredError,
    );
  });

  test("throws RefreshTokenReuseError when the token was already rotated away (revoked)", () => {
    const alreadyRotated = record({
      revokedAt: new Date(),
      replacedById: "rt-2",
    });

    expect(() => assertRefreshTokenUsable(alreadyRotated, new Date())).toThrow(
      RefreshTokenReuseError,
    );
  });
});
