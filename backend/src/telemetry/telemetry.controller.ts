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

// Minimal shape we need from express.Response - avoids depending on
// @types/express (not installed) just to set a dynamic status code.
interface StatusSettableResponse {
  status(code: number): void;
}

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  // Devices ingest telemetry without a user session - no JWT auth exists for
  // them yet, so these two stay open by design (unlike the rest of the API,
  // which is protected by default).
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
