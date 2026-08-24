import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SimController } from './sim.controller';
import { SimService } from './sim.service';

@Module({
  imports: [AuthModule],
  controllers: [SimController],
  providers: [SimService],
})
export class SimModule {}
