import { PushService } from '../../src/push/push.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PushService.register', () => {
  test('upserts by expoPushToken, keyed to the given user and platform', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'push-1' });
    const prisma = { pushToken: { upsert } } as unknown as PrismaService;
    const service = new PushService(prisma);

    await service.register('user-1', 'ExponentPushToken[abc]', 'android');

    expect(upsert).toHaveBeenCalledWith({
      where: { expoPushToken: 'ExponentPushToken[abc]' },
      create: { userId: 'user-1', expoPushToken: 'ExponentPushToken[abc]', platform: 'android' },
      update: { userId: 'user-1', platform: 'android' },
    });
  });
});
