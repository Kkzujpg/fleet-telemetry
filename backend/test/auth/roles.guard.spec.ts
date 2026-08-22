import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../../src/auth/roles.guard';
import { Roles } from '../../src/auth/roles.decorator';

class FakeController {
  @Roles('admin', 'operator')
  guarded() {}

  unguarded() {}
}

function contextFor(handlerName: keyof FakeController, user: unknown): ExecutionContext {
  const handler = FakeController.prototype[handlerName];
  return {
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  test('allows a user whose role is in the required list', () => {
    const context = contextFor('guarded', { sub: 'user-1', role: 'operator' });

    expect(guard.canActivate(context)).toBe(true);
  });

  test('denies a user whose role is not in the required list', () => {
    const context = contextFor('guarded', { sub: 'user-1', role: 'viewer' });

    expect(guard.canActivate(context)).toBe(false);
  });

  test('allows any authenticated user through when no @Roles() is present', () => {
    const context = contextFor('unguarded', { sub: 'user-1', role: 'viewer' });

    expect(guard.canActivate(context)).toBe(true);
  });

  test('denies when there is no user on the request', () => {
    const context = contextFor('guarded', undefined);

    expect(guard.canActivate(context)).toBe(false);
  });
});
