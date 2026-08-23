import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  parseHistoryQuery,
  parseListDevicesQuery,
  parsePatchDeviceBody,
} from '../../src/devices/devices.dto';

describe('parseListDevicesQuery', () => {
  test('defaults limit and leaves optional filters undefined', () => {
    const query = parseListDevicesQuery({});
    expect(query).toEqual({
      status: undefined,
      q: undefined,
      cursor: undefined,
      limit: DEFAULT_PAGE_LIMIT,
    });
  });

  test('accepts a valid connectivity status', () => {
    expect(parseListDevicesQuery({ status: 'online' }).status).toBe('online');
  });

  test('rejects an unknown status', () => {
    expect(() => parseListDevicesQuery({ status: 'ACTIVE' })).toThrow(BadRequestException);
  });

  test('rejects a limit above the max', () => {
    expect(() => parseListDevicesQuery({ limit: String(MAX_PAGE_LIMIT + 1) })).toThrow(
      BadRequestException,
    );
  });

  test('rejects a non-integer limit', () => {
    expect(() => parseListDevicesQuery({ limit: '1.5' })).toThrow(BadRequestException);
  });

  test('trims q and treats blank q as absent', () => {
    expect(parseListDevicesQuery({ q: '  ABC123  ' }).q).toBe('ABC123');
    expect(parseListDevicesQuery({ q: '   ' }).q).toBeUndefined();
  });
});

describe('parseHistoryQuery', () => {
  test('requires both from and to', () => {
    expect(() => parseHistoryQuery({ from: '2026-08-23T00:00:00.000Z' })).toThrow(
      BadRequestException,
    );
  });

  test('rejects from >= to', () => {
    expect(() =>
      parseHistoryQuery({ from: '2026-08-23T12:00:00.000Z', to: '2026-08-23T12:00:00.000Z' }),
    ).toThrow(BadRequestException);
  });

  test('defaults bucket to 5m', () => {
    const query = parseHistoryQuery({
      from: '2026-08-23T00:00:00.000Z',
      to: '2026-08-23T06:00:00.000Z',
    });
    expect(query.bucketSeconds).toBe(5 * 60);
  });

  test('parses bucket units s/m/h', () => {
    const base = { from: '2026-08-23T00:00:00.000Z', to: '2026-08-23T06:00:00.000Z' };
    expect(parseHistoryQuery({ ...base, bucket: '30s' }).bucketSeconds).toBe(30);
    expect(parseHistoryQuery({ ...base, bucket: '5m' }).bucketSeconds).toBe(300);
    expect(parseHistoryQuery({ ...base, bucket: '1h' }).bucketSeconds).toBe(3600);
  });

  test('rejects a malformed bucket', () => {
    expect(() =>
      parseHistoryQuery({
        from: '2026-08-23T00:00:00.000Z',
        to: '2026-08-23T06:00:00.000Z',
        bucket: '5',
      }),
    ).toThrow(BadRequestException);
  });
});

describe('parsePatchDeviceBody', () => {
  test('accepts a partial update with just plate', () => {
    expect(parsePatchDeviceBody({ plate: 'XYZ999' })).toEqual({ plate: 'XYZ999' });
  });

  test('rejects an empty body', () => {
    expect(() => parsePatchDeviceBody({})).toThrow(BadRequestException);
  });

  test('rejects a non-positive tankCapacityL', () => {
    expect(() => parsePatchDeviceBody({ tankCapacityL: 0 })).toThrow(BadRequestException);
  });

  test('rejects an invalid operational status', () => {
    expect(() => parsePatchDeviceBody({ status: 'online' })).toThrow(BadRequestException);
  });

  test('accepts a valid operational status', () => {
    expect(parsePatchDeviceBody({ status: 'MAINTENANCE' })).toEqual({ status: 'MAINTENANCE' });
  });
});
