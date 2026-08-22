import { Injectable } from '@nestjs/common';
import { sign, verify } from '../../../shared/jwt';

export interface AccessTokenClaims {
  sub: string;
  role: string;
  [key: string]: unknown;
}

const ACCESS_TOKEN_TTL_SEC = 15 * 60;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

@Injectable()
export class AccessTokenService {
  constructor(private readonly secret: string = requireEnv('JWT_SECRET')) {}

  sign(claims: AccessTokenClaims): string {
    return sign(claims, this.secret, ACCESS_TOKEN_TTL_SEC);
  }

  verify(token: string): AccessTokenClaims & { iat: number; exp: number } {
    return verify<AccessTokenClaims>(token, this.secret);
  }
}
