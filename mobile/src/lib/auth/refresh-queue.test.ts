import { createRefreshQueue } from './refresh-queue';

describe('createRefreshQueue', () => {
  test('coalesces concurrent calls into a single underlying refresh', async () => {
    let calls = 0;
    const refresh = jest.fn(async () => {
      calls += 1;
      return `token-${calls}`;
    });
    const getFreshAccessToken = createRefreshQueue(refresh);

    const [a, b, c] = await Promise.all([
      getFreshAccessToken(),
      getFreshAccessToken(),
      getFreshAccessToken(),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(a).toBe('token-1');
    expect(b).toBe('token-1');
    expect(c).toBe('token-1');
  });

  test('starts a new refresh once the previous one settles', async () => {
    let calls = 0;
    const refresh = jest.fn(async () => {
      calls += 1;
      return `token-${calls}`;
    });
    const getFreshAccessToken = createRefreshQueue(refresh);

    const first = await getFreshAccessToken();
    const second = await getFreshAccessToken();

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(first).toBe('token-1');
    expect(second).toBe('token-2');
  });

  test('a rejected refresh clears the in-flight lock so the next call retries', async () => {
    const refresh = jest
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce('token-ok');
    const getFreshAccessToken = createRefreshQueue(refresh);

    await expect(getFreshAccessToken()).rejects.toThrow('network down');
    await expect(getFreshAccessToken()).resolves.toBe('token-ok');
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
