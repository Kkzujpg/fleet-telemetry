import { BadRequestException } from '@nestjs/common';
import { parseLoginBody } from '../../src/auth/auth.dto';

describe('parseLoginBody', () => {
  test('accepts a valid body and lowercases the email', () => {
    const payload = parseLoginBody({ email: 'Admin@Fleet.Demo', password: 'secret123' });

    expect(payload).toEqual({ email: 'admin@fleet.demo', password: 'secret123' });
  });

  test('rejects a missing email', () => {
    expect(() => parseLoginBody({ password: 'secret123' })).toThrow(BadRequestException);
  });

  test('rejects a missing password', () => {
    expect(() => parseLoginBody({ email: 'admin@fleet.demo' })).toThrow(BadRequestException);
  });

  test('rejects a malformed email', () => {
    expect(() => parseLoginBody({ email: 'not-an-email', password: 'secret123' })).toThrow(
      BadRequestException,
    );
  });

  test('rejects a non-object body', () => {
    expect(() => parseLoginBody('nope')).toThrow(BadRequestException);
  });

  test('rejects an empty password', () => {
    expect(() => parseLoginBody({ email: 'admin@fleet.demo', password: '' })).toThrow(
      BadRequestException,
    );
  });
});
