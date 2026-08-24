import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AlertsService, AlertView, ListAlertsResult } from './alerts.service';
import { parseCursorQuery, parseListAlertsQuery } from './alerts.dto';

// Forma mínima que necesitamos de express.Response - evita depender de
// @types/express (no instalado) solo para setear un status code dinámico.
interface StatusSettableResponse {
  status(code: number): void;
}

interface AuthenticatedRequest {
  user: { sub: string; role: string };
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('alerts')
  list(
    @Query('status') status: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ): Promise<ListAlertsResult> {
    const query = parseListAlertsQuery({ status, cursor, limit });
    return this.alerts.list(query);
  }

  @Post('alerts/:id/ack')
  async ack(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: StatusSettableResponse,
  ): Promise<AlertView> {
    const result = await this.alerts.acknowledge(id, req.user.sub, idempotencyKey || undefined);
    res.status(result.status === 'conflict' ? HttpStatus.CONFLICT : HttpStatus.OK);
    return result.alert;
  }

  @Get('devices/:id/alerts')
  history(
    @Param('id') deviceId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ): Promise<ListAlertsResult> {
    const query = parseCursorQuery({ cursor, limit });
    return this.alerts.listForDevice(deviceId, query);
  }
}
