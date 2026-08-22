import { AccessTokenService } from '../../src/auth/access-token.service';
import { JwtInvalidSignatureError } from '../../../shared/jwt';

describe('AccessTokenService', () => {
  test('signs and verifies claims with a 15 minute expiry', () => {
    const service = new AccessTokenService('unit-test-secret');

    const token = service.sign({ sub: 'user-1', role: 'admin' });
    const claims = service.verify(token);

    expect(claims.sub).toBe('user-1');
    expect(claims.role).toBe('admin');
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  test('rejects a token signed with a different secret', () => {
    const service = new AccessTokenService('unit-test-secret');
    const other = new AccessTokenService('a-different-secret');

    const token = other.sign({ sub: 'user-1', role: 'admin' });

    expect(() => service.verify(token)).toThrow(JwtInvalidSignatureError);
  });
});
