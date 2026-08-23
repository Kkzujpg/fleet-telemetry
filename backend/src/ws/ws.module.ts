import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TelemetryGateway } from './telemetry.gateway';

@Module({
  imports: [AuthModule],
  providers: [TelemetryGateway],
  exports: [TelemetryGateway],
})
export class WsModule {}
