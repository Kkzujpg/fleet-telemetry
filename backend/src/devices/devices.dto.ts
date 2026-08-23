import { BadRequestException } from '@nestjs/common';
import { DeviceConnectivityStatus } from '../../../shared/device-status';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

const CONNECTIVITY_STATUSES: DeviceConnectivityStatus[] = ['online', 'stale', 'offline'];
const OPERATIONAL_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'] as const;
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export interface ListDevicesQuery {
  status?: DeviceConnectivityStatus;
  q?: string;
  cursor?: string;
  limit: number;
}

export function parseListDevicesQuery(raw: {
  status?: string;
  q?: string;
  cursor?: string;
  limit?: string;
}): ListDevicesQuery {
  let status: DeviceConnectivityStatus | undefined;
  if (raw.status !== undefined) {
    if (!CONNECTIVITY_STATUSES.includes(raw.status as DeviceConnectivityStatus)) {
      throw new BadRequestException(`status must be one of: ${CONNECTIVITY_STATUSES.join(', ')}`);
    }
    status = raw.status as DeviceConnectivityStatus;
  }

  let limit = DEFAULT_PAGE_LIMIT;
  if (raw.limit !== undefined) {
    const parsed = Number(raw.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_LIMIT) {
      throw new BadRequestException(`limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`);
    }
    limit = parsed;
  }

  return {
    status,
    q: raw.q?.trim() || undefined,
    cursor: raw.cursor || undefined,
    limit,
  };
}

export interface HistoryQuery {
  from: Date;
  to: Date;
  bucketSeconds: number;
}

const BUCKET_PATTERN = /^(\d+)(s|m|h)$/;
const BUCKET_UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600 };

export function parseHistoryQuery(raw: {
  from?: string;
  to?: string;
  bucket?: string;
}): HistoryQuery {
  if (!raw.from || !raw.to) {
    throw new BadRequestException('from and to are required');
  }

  const from = new Date(raw.from);
  const to = new Date(raw.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException('from and to must be valid ISO date strings');
  }
  if (from >= to) {
    throw new BadRequestException('from must be before to');
  }

  const bucket = raw.bucket ?? '5m';
  const match = BUCKET_PATTERN.exec(bucket);
  if (!match) {
    throw new BadRequestException('bucket must look like "30s", "5m" or "1h"');
  }
  const [, amount, unit] = match;
  const bucketSeconds = Number(amount) * BUCKET_UNIT_SECONDS[unit];
  if (bucketSeconds <= 0) {
    throw new BadRequestException('bucket must be a positive duration');
  }

  return { from, to, bucketSeconds };
}

export interface PatchDeviceBody {
  plate?: string;
  tankCapacityL?: number;
  status?: OperationalStatus;
}

export function parsePatchDeviceBody(body: unknown): PatchDeviceBody {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('body must be an object');
  }
  const b = body as Record<string, unknown>;
  const result: PatchDeviceBody = {};

  if (b.plate !== undefined) {
    if (typeof b.plate !== 'string' || b.plate.trim().length === 0) {
      throw new BadRequestException('plate must be a non-empty string');
    }
    result.plate = b.plate.trim();
  }

  if (b.tankCapacityL !== undefined) {
    if (
      typeof b.tankCapacityL !== 'number' ||
      !Number.isFinite(b.tankCapacityL) ||
      b.tankCapacityL <= 0
    ) {
      throw new BadRequestException('tankCapacityL must be a positive number');
    }
    result.tankCapacityL = b.tankCapacityL;
  }

  if (b.status !== undefined) {
    if (!OPERATIONAL_STATUSES.includes(b.status as OperationalStatus)) {
      throw new BadRequestException(`status must be one of: ${OPERATIONAL_STATUSES.join(', ')}`);
    }
    result.status = b.status as OperationalStatus;
  }

  if (Object.keys(result).length === 0) {
    throw new BadRequestException('at least one of plate, tankCapacityL, status must be provided');
  }

  return result;
}
