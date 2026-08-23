import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WsModule } from '../ws/ws.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [AuthModule, WsModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
