import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { AccessTokenService } from '../../src/auth/access-token.service';
import { Public } from '../../src/auth/public.decorator';

class FakeController {
  @Public()
  open() {}

  guarded() {}
}

function contextFor(
  handlerName: keyof FakeController,
  headers: Record<string, string>,
  request: Record<string, unknown> = {},
): ExecutionContext {
  const handler = FakeController.prototype[handlerName];
  const req: Record<string, unknown> = { headers, ...request };
  return {
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const tokens = new AccessTokenService('unit-test-secret');
  const guard = new JwtAuthGuard(tokens, new Reflector());

  test('attaches claims to request.user and allows the request through', () => {
    const token = tokens.sign({ sub: 'user-1', role: 'admin' });
    const handler = FakeController.prototype.guarded;
    const req: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    const context = {
      getHandler: () => handler,
      getClass: () => FakeController,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(req.user).toMatchObject({ sub: 'user-1', role: 'admin' });
  });

  test('rejects a request with no authorization header', () => {
    const context = contextFor('guarded', {});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  test('rejects a non-Bearer authorization header', () => {
    const context = contextFor('guarded', { authorization: 'Basic dXNlcjpwYXNz' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  test('rejects an invalid or expired token', () => {
    const context = contextFor('guarded', { authorization: 'Bearer not-a-real-token' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  test('allows a route marked @Public() through without a token', () => {
    const context = contextFor('open', {});

    expect(guard.canActivate(context)).toBe(true);
  });
});
