import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushPlatform } from './push.dto';

@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, expoPushToken: string, platform: PushPlatform): Promise<void> {
    await this.prisma.pushToken.upsert({
      where: { expoPushToken },
      create: { userId, expoPushToken, platform },
      update: { userId, platform },
    });
  }
}
