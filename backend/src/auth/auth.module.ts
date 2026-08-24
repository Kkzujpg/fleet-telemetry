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
    // Global por defecto: cualquier endpoint agregado después queda protegido
    // salvo que use @Public() para excluirse. JwtAuthGuard debe correr antes
    // que RolesGuard para que request.user esté poblado cuando se evalúan
    // los roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AccessTokenService],
})
export class AuthModule {}
