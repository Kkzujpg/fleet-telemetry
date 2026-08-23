import { BadRequestException } from '@nestjs/common';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../devices/devices.dto';

export type AlertListStatus = 'active' | 'all';
const ALERT_LIST_STATUSES: AlertListStatus[] = ['active', 'all'];

export interface ListAlertsQuery {
  status: AlertListStatus;
  cursor?: string;
  limit: number;
}

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_PAGE_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_LIMIT) {
    throw new BadRequestException(`limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`);
  }
  return parsed;
}

export function parseListAlertsQuery(raw: {
  status?: string;
  cursor?: string;
  limit?: string;
}): ListAlertsQuery {
  let status: AlertListStatus = 'active';
  if (raw.status !== undefined) {
    if (!ALERT_LIST_STATUSES.includes(raw.status as AlertListStatus)) {
      throw new BadRequestException(`status must be one of: ${ALERT_LIST_STATUSES.join(', ')}`);
    }
    status = raw.status as AlertListStatus;
  }

  return {
    status,
    cursor: raw.cursor || undefined,
    limit: parseLimit(raw.limit),
  };
}

export interface CursorQuery {
  cursor?: string;
  limit: number;
}

export function parseCursorQuery(raw: { cursor?: string; limit?: string }): CursorQuery {
  return {
    cursor: raw.cursor || undefined,
    limit: parseLimit(raw.limit),
  };
}
