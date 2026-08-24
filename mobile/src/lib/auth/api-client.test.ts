import { ApiError, createApiClient } from './api-client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function buildClient(overrides?: { fetchImpl?: jest.Mock }) {
  const fetchImpl = overrides?.fetchImpl ?? jest.fn();
  (global as unknown as { fetch: jest.Mock }).fetch = fetchImpl;

  let accessToken: string | null = null;
  let refreshToken: string | null = 'stored-refresh-token';
  const onUnauthenticated = jest.fn();

  const client = createApiClient({
    getAccessToken: () => accessToken,
    setAccessToken: (t) => {
      accessToken = t;
    },
    getRefreshToken: async () => refreshToken,
    setRefreshToken: async (t) => {
      refreshToken = t;
    },
    onUnauthenticated,
  });

  return { client, fetchImpl, onUnauthenticated, getAccessToken: () => accessToken, getRefreshToken: () => refreshToken };
}

describe('createApiClient', () => {
  test('attaches the access token as a bearer header', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const { client } = buildClient({ fetchImpl });
    // seed an access token by forcing one refresh first
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'access-1', refreshToken: 'refresh-2' }),
    );
    await client.refresh();

    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { hello: 'world' }));
    await client.apiFetch('/devices');

    const call = fetchImpl.mock.calls[1];
    expect(call[0]).toBe('http://localhost:3001/api/v1/devices');
    expect(call[1].headers.authorization).toBe('Bearer access-1');
  });

  test('on a 401, refreshes once and retries the original request', async () => {
    const fetchImpl = jest.fn();
    const { client } = buildClient({ fetchImpl });

    fetchImpl
      .mockResolvedValueOnce(jsonResponse(401, {})) // first attempt, expired token
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'fresh', refreshToken: 'r2' })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { data: 1 })); // retry

    const result = await client.apiFetch('/devices');

    expect(result).toEqual({ data: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1][0]).toBe('http://localhost:3001/api/v1/auth/mobile/refresh');
    expect(fetchImpl.mock.calls[2][1].headers.authorization).toBe('Bearer fresh');
  });

  test('when there is no stored refresh token, fails fast and calls onUnauthenticated', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(401, {}));
    let refreshToken: string | null = null;
    const onUnauthenticated = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchImpl;

    const client = createApiClient({
      getAccessToken: () => null,
      setAccessToken: () => undefined,
      getRefreshToken: async () => refreshToken,
      setRefreshToken: async (t) => {
        refreshToken = t;
      },
      onUnauthenticated,
    });

    await expect(client.apiFetch('/devices')).rejects.toThrow(ApiError);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    // no network call for the refresh itself - only the doomed first attempt
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('a failed refresh clears both tokens and calls onUnauthenticated', async () => {
    const fetchImpl = jest.fn();
    const { client, onUnauthenticated, getRefreshToken } = buildClient({ fetchImpl });

    fetchImpl
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {})); // refresh itself rejected (reuse detection)

    await expect(client.apiFetch('/devices')).rejects.toThrow(ApiError);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(getRefreshToken()).toBeNull();
  });
});
