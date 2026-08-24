// Fakes expo-sqlite with a tiny in-memory engine that understands exactly the
// queries offline.ts issues (no real SQL parser) - enough to exercise the
// module's actual read/write behaviour rather than just asserting call shapes.
import { enqueue, flushQueue, pendingCount, readCache, saveCache } from './offline';

jest.mock('expo-sqlite', () => {
  const cache = new Map<string, string>();
  const outbox: { id: string; kind: string; payload: string; enqueued_at: string }[] = [];

  const db = {
    execAsync: async () => undefined,
    runAsync: async (sql: string, ...args: unknown[]) => {
      if (sql.startsWith('INSERT INTO cache')) {
        const [key, data] = args as [string, string];
        cache.set(key, data);
      } else if (sql.startsWith('INSERT INTO outbox')) {
        const [id, kind, payload, enqueuedAt] = args as [string, string, string, string];
        outbox.push({ id, kind, payload, enqueued_at: enqueuedAt });
      } else if (sql.startsWith('DELETE FROM outbox')) {
        const [id] = args as [string];
        const idx = outbox.findIndex((row) => row.id === id);
        if (idx !== -1) outbox.splice(idx, 1);
      } else {
        throw new Error(`unhandled runAsync SQL in test fake: ${sql}`);
      }
    },
    getFirstAsync: async (sql: string, ...args: unknown[]) => {
      if (sql.startsWith('SELECT data FROM cache')) {
        const [key] = args as [string];
        const data = cache.get(key);
        return data ? { data } : null;
      }
      if (sql.startsWith('SELECT COUNT(*)')) {
        return { count: outbox.length };
      }
      throw new Error(`unhandled getFirstAsync SQL in test fake: ${sql}`);
    },
    getAllAsync: async (sql: string) => {
      if (sql.startsWith('SELECT * FROM outbox')) {
        return [...outbox].sort((a, b) => a.enqueued_at.localeCompare(b.enqueued_at));
      }
      throw new Error(`unhandled getAllAsync SQL in test fake: ${sql}`);
    },
  };

  return {
    openDatabaseAsync: async () => db,
    __reset: () => {
      cache.clear();
      outbox.length = 0;
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports -- needs the mocked module's own __reset, not its ESM re-export
const fakeSqlite = require('expo-sqlite') as { __reset: () => void };

beforeEach(() => {
  fakeSqlite.__reset();
});

describe('offline cache', () => {
  test('readCache returns null when nothing is stored', async () => {
    await expect(readCache('devices:list')).resolves.toBeNull();
  });

  test('saveCache then readCache round-trips arbitrary JSON', async () => {
    await saveCache('devices:list', { items: [{ id: '1' }], nextCursor: null });
    await expect(readCache('devices:list')).resolves.toEqual({
      items: [{ id: '1' }],
      nextCursor: null,
    });
  });

  test('saveCache overwrites the previous value for the same key', async () => {
    await saveCache('devices:list', { v: 1 });
    await saveCache('devices:list', { v: 2 });
    await expect(readCache('devices:list')).resolves.toEqual({ v: 2 });
  });
});

describe('offline outbox', () => {
  test('pendingCount is 0 with an empty outbox', async () => {
    await expect(pendingCount()).resolves.toBe(0);
  });

  test('enqueue increments pendingCount', async () => {
    await enqueue({ kind: 'alert:ack', payload: { alertId: 'a1' } });
    await expect(pendingCount()).resolves.toBe(1);
  });

  test('flushQueue removes actions the handler accepts, in enqueue order', async () => {
    await enqueue({ kind: 'alert:ack', payload: { alertId: 'a1' } });
    await enqueue({ kind: 'alert:ack', payload: { alertId: 'a2' } });

    const seen: string[] = [];
    await flushQueue(async (action) => {
      seen.push((action.payload as { alertId: string }).alertId);
      return true;
    });

    expect(seen).toEqual(['a1', 'a2']);
    await expect(pendingCount()).resolves.toBe(0);
  });

  test('flushQueue leaves rejected actions queued for the next flush', async () => {
    await enqueue({ kind: 'alert:ack', payload: { alertId: 'fails' } });
    await enqueue({ kind: 'alert:ack', payload: { alertId: 'succeeds' } });

    await flushQueue(async (action) => (action.payload as { alertId: string }).alertId === 'succeeds');

    expect(await pendingCount()).toBe(1);
    const remaining: string[] = [];
    await flushQueue(async (action) => {
      remaining.push((action.payload as { alertId: string }).alertId);
      return false;
    });
    expect(remaining).toEqual(['fails']);
  });

  test('a handler that throws leaves the action queued', async () => {
    await enqueue({ kind: 'alert:ack', payload: { alertId: 'boom' } });

    await flushQueue(async () => {
      throw new Error('network error');
    });

    expect(await pendingCount()).toBe(1);
  });
});
