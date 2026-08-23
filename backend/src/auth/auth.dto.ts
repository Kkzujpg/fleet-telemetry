import { BadRequestException } from '@nestjs/common';

export interface LoginPayload {
  email: string;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
  return value;
}

export function parseLoginBody(body: unknown): LoginPayload {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('body must be an object');
  }
  const b = body as Record<string, unknown>;

  const email = requireString(b.email, 'email').toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new BadRequestException('email must be a valid email address');
  }

  return { email, password: requireString(b.password, 'password') };
}

export interface RefreshTokenPayload {
  refreshToken: string;
}

export function parseRefreshTokenBody(body: unknown): RefreshTokenPayload {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('body must be an object');
  }
  const b = body as Record<string, unknown>;
  return { refreshToken: requireString(b.refreshToken, 'refreshToken') };
}
