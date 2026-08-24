import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BlockInProduction } from '../common/block-in-production.decorator';
import { SimService, SimStatus } from './sim.service';

@Controller('sim')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@BlockInProduction()
export class SimController {
  constructor(private readonly sim: SimService) {}

  @Post('start')
  start(): Promise<SimStatus> {
    return this.sim.start();
  }

  @Post('stop')
  stop(): SimStatus {
    return this.sim.stop();
  }

  @Post('drain/:deviceId')
  drain(@Param('deviceId') deviceId: string): SimStatus {
    return this.sim.drain(deviceId);
  }
}
