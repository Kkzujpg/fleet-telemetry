import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { AccessTokenService } from '../../src/auth/access-token.service';

function contextFor(headers: Record<string, string>, request: Record<string, unknown> = {}) {
  const req: Record<string, unknown> = { headers, ...request };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const tokens = new AccessTokenService('unit-test-secret');
  const guard = new JwtAuthGuard(tokens);

  test('attaches claims to request.user and allows the request through', () => {
    const token = tokens.sign({ sub: 'user-1', role: 'admin' });
    const req: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(req.user).toMatchObject({ sub: 'user-1', role: 'admin' });
  });

  test('rejects a request with no authorization header', () => {
    const context = contextFor({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  test('rejects a non-Bearer authorization header', () => {
    const context = contextFor({ authorization: 'Basic dXNlcjpwYXNz' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  test('rejects an invalid or expired token', () => {
    const context = contextFor({ authorization: 'Bearer not-a-real-token' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
