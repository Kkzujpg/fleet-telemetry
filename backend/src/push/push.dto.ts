import { BadRequestException } from '@nestjs/common';

export type PushPlatform = 'ios' | 'android';

const PLATFORMS: PushPlatform[] = ['ios', 'android'];
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;

export interface RegisterPushTokenPayload {
  expoPushToken: string;
  platform: PushPlatform;
}

export function parseRegisterPushTokenBody(body: unknown): RegisterPushTokenPayload {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('body must be an object');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.expoPushToken !== 'string' || !EXPO_TOKEN_RE.test(b.expoPushToken)) {
    throw new BadRequestException('expoPushToken must be a valid Expo push token');
  }

  if (!PLATFORMS.includes(b.platform as PushPlatform)) {
    throw new BadRequestException(`platform must be one of: ${PLATFORMS.join(', ')}`);
  }

  return { expoPushToken: b.expoPushToken, platform: b.platform as PushPlatform };
}
