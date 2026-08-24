import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PushService } from './push.service';
import { parseRegisterPushTokenBody } from './push.dto';

interface AuthenticatedRequest {
  user: { sub: string; role: string };
}

@Controller('push')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const { expoPushToken, platform } = parseRegisterPushTokenBody(body);
    await this.push.register(req.user.sub, expoPushToken, platform);
    return { ok: true };
  }
}
