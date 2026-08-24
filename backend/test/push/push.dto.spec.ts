import { BadRequestException } from '@nestjs/common';
import { parseRegisterPushTokenBody } from '../../src/push/push.dto';

describe('parseRegisterPushTokenBody', () => {
  test('accepts a valid Expo push token and platform', () => {
    const result = parseRegisterPushTokenBody({
      expoPushToken: 'ExponentPushToken[abc123XYZ]',
      platform: 'android',
    });
    expect(result).toEqual({ expoPushToken: 'ExponentPushToken[abc123XYZ]', platform: 'android' });
  });

  test('accepts ios platform', () => {
    const result = parseRegisterPushTokenBody({
      expoPushToken: 'ExponentPushToken[abc123XYZ]',
      platform: 'ios',
    });
    expect(result.platform).toBe('ios');
  });

  test('rejects a missing expoPushToken', () => {
    expect(() => parseRegisterPushTokenBody({ platform: 'ios' })).toThrow(BadRequestException);
  });

  test('rejects a token that does not look like an Expo push token', () => {
    expect(() =>
      parseRegisterPushTokenBody({ expoPushToken: 'not-a-real-token', platform: 'ios' }),
    ).toThrow(BadRequestException);
  });

  test('rejects an unknown platform', () => {
    expect(() =>
      parseRegisterPushTokenBody({ expoPushToken: 'ExponentPushToken[abc]', platform: 'web' }),
    ).toThrow(BadRequestException);
  });

  test('rejects a non-object body', () => {
    expect(() => parseRegisterPushTokenBody(null)).toThrow(BadRequestException);
  });
});
