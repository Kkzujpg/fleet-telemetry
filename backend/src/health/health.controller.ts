import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { HealthReport, HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  check(): Promise<HealthReport> {
    return this.health.check();
  }
}
