import { createHmac, timingSafeEqual } from "node:crypto";

// Firma y verificación de JWT (HS256) implementadas a mano con node:crypto,
// sin librerías externas (jsonwebtoken, @nestjs/jwt, passport) - requisito
// no negociable de la prueba técnica.
export class JwtError extends Error {}

export class JwtMalformedError extends JwtError {}

export class JwtUnsupportedAlgorithmError extends JwtError {}

export class JwtInvalidSignatureError extends JwtError {}

export class JwtExpiredError extends JwtError {}

const SUPPORTED_ALG = "HS256";

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input as never).toString("base64url");
}

function base64UrlDecodeToString(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signHmac(signingInput: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(signingInput).digest();
}

export function sign(
  payload: Record<string, unknown>,
  secret: string,
  ttlSec: number,
): string {
  const header = { alg: SUPPORTED_ALG, typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSec;
  const fullPayload = { ...payload, iat, exp };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signatureB64 = signHmac(signingInput, secret).toString("base64url");

  return `${signingInput}.${signatureB64}`;
}

export function verify<
  T extends Record<string, unknown> = Record<string, unknown>,
>(token: string, secret: string): T & { iat: number; exp: number } {
  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new JwtMalformedError("token must have exactly 3 segments");
  }
  const [headerB64, payloadB64, signatureB64] = segments;

  let header: unknown;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
  } catch {
    throw new JwtMalformedError("header is not valid JSON");
  }

  const alg =
    typeof header === "object" && header !== null
      ? (header as Record<string, unknown>).alg
      : undefined;
  if (alg !== SUPPORTED_ALG) {
    throw new JwtUnsupportedAlgorithmError(
      `unsupported algorithm: ${String(alg)}`,
    );
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSignature = signHmac(signingInput, secret);

  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(signatureB64, "base64url");
  } catch {
    throw new JwtMalformedError("signature is not valid base64url");
  }

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new JwtInvalidSignatureError("signature does not match");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    throw new JwtMalformedError("payload is not valid JSON");
  }

  const { iat, exp } = payload as { iat?: unknown; exp?: unknown };
  if (typeof iat !== "number" || typeof exp !== "number") {
    throw new JwtMalformedError("payload is missing numeric iat/exp claims");
  }

  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) {
    throw new JwtExpiredError("token has expired");
  }

  return payload as T & { iat: number; exp: number };
}
