import { BadRequestException } from '@nestjs/common';
import { parseCursorQuery, parseListAlertsQuery } from '../../src/alerts/alerts.dto';

describe('parseListAlertsQuery', () => {
  test('defaults status to "active" when omitted', () => {
    expect(parseListAlertsQuery({})).toEqual({ status: 'active', cursor: undefined, limit: 20 });
  });

  test('accepts status "all"', () => {
    expect(parseListAlertsQuery({ status: 'all' }).status).toBe('all');
  });

  test('rejects an unknown status', () => {
    expect(() => parseListAlertsQuery({ status: 'closed' })).toThrow(BadRequestException);
  });

  test('rejects a limit outside 1..100', () => {
    expect(() => parseListAlertsQuery({ limit: '0' })).toThrow(BadRequestException);
    expect(() => parseListAlertsQuery({ limit: '101' })).toThrow(BadRequestException);
  });

  test('passes through a provided cursor and limit', () => {
    expect(parseListAlertsQuery({ cursor: 'abc', limit: '5' })).toEqual({
      status: 'active',
      cursor: 'abc',
      limit: 5,
    });
  });
});

describe('parseCursorQuery', () => {
  test('defaults limit and leaves cursor undefined', () => {
    expect(parseCursorQuery({})).toEqual({ cursor: undefined, limit: 20 });
  });

  test('rejects a non-integer limit', () => {
    expect(() => parseCursorQuery({ limit: 'abc' })).toThrow(BadRequestException);
  });
});
