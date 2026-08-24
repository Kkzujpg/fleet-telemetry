import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { WsModule } from './ws/ws.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { SimModule } from './sim/sim.module';
import { DevicesModule } from './devices/devices.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { PushModule } from './push/push.module';
import { MaskingInterceptor } from './common/masking.interceptor';

@Module({
  imports: [
    PrismaModule,
    WsModule,
    HealthModule,
    TelemetryModule,
    SimModule,
    DevicesModule,
    AlertsModule,
    AuthModule,
    PushModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: MaskingInterceptor }],
})
export class AppModule {}
