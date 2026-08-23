import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenService } from './access-token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { RefreshTokenService } from './refresh-token.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SlidingWindowRateLimiter } from '../../../shared/rate-limiter';
import { LOGIN_MAX_ATTEMPTS, LOGIN_RATE_LIMITER, LOGIN_WINDOW_MS } from './login-rate-limiter.token';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AccessTokenService,
      useFactory: () => new AccessTokenService(),
    },
    {
      provide: LOGIN_RATE_LIMITER,
      useFactory: () => new SlidingWindowRateLimiter(LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS),
    },
    RefreshTokenService,
    AuthService,
    // Global by default: any endpoint added later is protected unless it opts
    // out with @Public(). JwtAuthGuard must run before RolesGuard so
    // request.user is populated when role checks happen.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AccessTokenService],
})
export class AuthModule {}
