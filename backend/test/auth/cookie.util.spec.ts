import { parseCookieHeader } from '../../src/auth/cookie.util';

describe('parseCookieHeader', () => {
  test('returns an empty object for an undefined header', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  test('parses a single cookie', () => {
    expect(parseCookieHeader('refreshToken=abc123')).toEqual({ refreshToken: 'abc123' });
  });

  test('parses multiple cookies separated by "; "', () => {
    expect(parseCookieHeader('a=1; refreshToken=abc123; b=2')).toEqual({
      a: '1',
      refreshToken: 'abc123',
      b: '2',
    });
  });

  test('decodes URI-encoded values', () => {
    expect(parseCookieHeader('refreshToken=a%2Fb%3Dc')).toEqual({ refreshToken: 'a/b=c' });
  });

  test('ignores malformed segments without an "="', () => {
    expect(parseCookieHeader('garbage; refreshToken=abc123')).toEqual({ refreshToken: 'abc123' });
  });
});
