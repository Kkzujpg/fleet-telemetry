import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  BatchItemInput,
  BatchIngestResult,
  IngestResult,
  ReconcileResult,
  TelemetryService,
} from './telemetry.service';
import { parseBatchEnvelope, parseIngestPayload } from './telemetry.dto';

// Forma mínima que necesitamos de express.Response - evita depender de
// @types/express (no instalado) solo para setear un status code dinámico.
interface StatusSettableResponse {
  status(code: number): void;
}

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  // Los devices ingieren telemetría sin sesión de usuario - todavía no existe
  // auth JWT para ellos, así que estos dos endpoints quedan abiertos a
  // propósito (a diferencia del resto de la API, protegida por defecto).
  @Public()
  @Post()
  async ingest(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: StatusSettableResponse,
  ): Promise<IngestResult> {
    const payload = parseIngestPayload(body);
    const result = await this.telemetry.ingest(payload, idempotencyKey || undefined);
    res.status(result.duplicate ? HttpStatus.OK : HttpStatus.CREATED);
    return result;
  }

  @Public()
  @Post('batch')
  @HttpCode(HttpStatus.OK)
  async ingestBatch(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<BatchIngestResult> {
    const rawItems = parseBatchEnvelope(body);

    const items: BatchItemInput[] = rawItems.map((raw, index) => {
      try {
        return { index, payload: parseIngestPayload(raw) };
      } catch (error) {
        return {
          index,
          error: error instanceof BadRequestException ? extractMessage(error) : 'invalid reading',
        };
      }
    });

    return this.telemetry.ingestBatch(items, idempotencyKey || undefined);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  reconcile(
    @Query('since') since: string | undefined,
    @Query('deviceIds') deviceIds: string | undefined,
  ): Promise<ReconcileResult> {
    return this.telemetry.reconcile({
      since,
      deviceIds: deviceIds ? deviceIds.split(',').filter((id) => id.length > 0) : undefined,
    });
  }
}

function extractMessage(error: BadRequestException): string {
  const response = error.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  const message = (response as { message?: string | string[] }).message;
  return Array.isArray(message) ? message.join(', ') : (message ?? error.message);
}
