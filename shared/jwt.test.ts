import { createHmac } from "node:crypto";
import {
  sign,
  verify,
  JwtMalformedError,
  JwtUnsupportedAlgorithmError,
  JwtInvalidSignatureError,
  JwtExpiredError,
} from "./jwt";

const SECRET = "test-secret-do-not-use-in-prod";

function b64url(input: string | Buffer): string {
  return Buffer.from(input as never).toString("base64url");
}

function buildToken(
  header: unknown,
  payload: unknown,
  secret = SECRET,
): string {
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

describe("sign/verify", () => {
  test("round-trips claims through a valid signature", () => {
    const token = sign({ sub: "user-1", role: "admin" }, SECRET, 60);

    const claims = verify<{ sub: string; role: string }>(token, SECRET);

    expect(claims.sub).toBe("user-1");
    expect(claims.role).toBe("admin");
    expect(typeof claims.iat).toBe("number");
    expect(typeof claims.exp).toBe("number");
  });

  test("rejects a token whose payload segment was tampered with", () => {
    const token = sign({ sub: "user-1", role: "admin" }, SECRET, 60);
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    const tamperedChar = payloadB64[0] === "a" ? "b" : "a";
    const tamperedPayload = tamperedChar + payloadB64.slice(1);
    const tamperedToken = `${headerB64}.${tamperedPayload}.${signatureB64}`;

    expect(() => verify(tamperedToken, SECRET)).toThrow(
      JwtInvalidSignatureError,
    );
  });

  test("rejects an expired token", () => {
    const token = sign({ sub: "user-1", role: "admin" }, SECRET, -10);

    expect(() => verify(token, SECRET)).toThrow(JwtExpiredError);
  });

  test("rejects alg:none before checking the signature", () => {
    const token = buildToken(
      { alg: "none", typ: "JWT" },
      { sub: "user-1", exp: 9999999999, iat: 0 },
    );

    expect(() => verify(token, SECRET)).toThrow(JwtUnsupportedAlgorithmError);
  });

  test("rejects alg:RS256 (algorithm confusion) before checking the signature", () => {
    const token = buildToken(
      { alg: "RS256", typ: "JWT" },
      { sub: "user-1", exp: 9999999999, iat: 0 },
    );

    expect(() => verify(token, SECRET)).toThrow(JwtUnsupportedAlgorithmError);
  });

  test("rejects a token with fewer than 3 segments", () => {
    expect(() => verify("only.two", SECRET)).toThrow(JwtMalformedError);
  });

  test("rejects a payload that is not valid JSON", () => {
    const headerB64 = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payloadB64 = b64url("not-valid-json");
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = createHmac("sha256", SECRET)
      .update(signingInput)
      .digest("base64url");
    const token = `${signingInput}.${signature}`;

    expect(() => verify(token, SECRET)).toThrow(JwtMalformedError);
  });
});
