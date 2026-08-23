import { BadRequestException } from '@nestjs/common';

export const MAX_BATCH_SIZE = 500;
export const FUTURE_CLOCK_SKEW_MS = 5 * 60_000;

export interface IngestTelemetryPayload {
  devicePublicId: string;
  recordedAt: Date;
  lat: number;
  lng: number;
  speedKph: number;
  fuelLevelPct: number;
  engineTempC: number;
  odometerKm: number;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${field} must be a finite number`);
  }
  return value;
}

function requireRange(value: number, field: string, min: number, max: number): number {
  if (value < min || value > max) {
    throw new BadRequestException(`${field} must be between ${min} and ${max}`);
  }
  return value;
}

function requireDate(value: unknown, field: string): Date {
  const raw = requireString(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid ISO date string`);
  }
  return date;
}

/** `now` is injectable so tests don't race the clock-skew check against wall-clock time. */
export function parseIngestPayload(body: unknown, now: Date = new Date()): IngestTelemetryPayload {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('body must be an object');
  }
  const b = body as Record<string, unknown>;

  const recordedAt = requireDate(b.recordedAt, 'recordedAt');
  if (recordedAt.getTime() > now.getTime() + FUTURE_CLOCK_SKEW_MS) {
    throw new BadRequestException(
      `recordedAt cannot be more than ${FUTURE_CLOCK_SKEW_MS / 60_000} minutes in the future`,
    );
  }

  return {
    devicePublicId: requireString(b.devicePublicId, 'devicePublicId'),
    recordedAt,
    lat: requireRange(requireFiniteNumber(b.lat, 'lat'), 'lat', -90, 90),
    lng: requireRange(requireFiniteNumber(b.lng, 'lng'), 'lng', -180, 180),
    speedKph: requireFiniteNumber(b.speedKph, 'speedKph'),
    fuelLevelPct: requireRange(
      requireFiniteNumber(b.fuelLevelPct, 'fuelLevelPct'),
      'fuelLevelPct',
      0,
      100,
    ),
    engineTempC: requireFiniteNumber(b.engineTempC, 'engineTempC'),
    odometerKm: requireFiniteNumber(b.odometerKm, 'odometerKm'),
  };
}

/** Only checks the envelope (array, size); each item is parsed individually so one bad row doesn't fail the batch. */
export function parseBatchEnvelope(body: unknown): unknown[] {
  if (!Array.isArray(body)) {
    throw new BadRequestException('body must be an array of readings');
  }
  if (body.length === 0) {
    throw new BadRequestException('batch must contain at least one reading');
  }
  if (body.length > MAX_BATCH_SIZE) {
    throw new BadRequestException(`batch exceeds max size of ${MAX_BATCH_SIZE}`);
  }
  return body;
}
