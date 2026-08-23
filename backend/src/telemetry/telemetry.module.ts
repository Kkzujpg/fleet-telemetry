import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WsModule } from '../ws/ws.module';
import { AlertsModule } from '../alerts/alerts.module';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [WsModule, AuthModule, AlertsModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
