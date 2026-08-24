// Simula expo-sqlite con un motor en memoria diminuto que entiende
// exactamente las queries que emite offline.ts (sin parser SQL real) -
// suficiente para ejercitar el comportamiento real de lectura/escritura del
// módulo en vez de solo verificar la forma de las llamadas.
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

// eslint-disable-next-line @typescript-eslint/no-require-imports -- necesita el __reset propio del módulo mockeado, no su re-export ESM
const fakeSqlite = require('expo-sqlite') as { __reset: () => void };

beforeEach(() => {
  fakeSqlite.__reset();
});

describe('offline cache', () => {
  test('readCache devuelve null cuando no hay nada guardado', async () => {
    await expect(readCache('devices:list')).resolves.toBeNull();
  });

  test('saveCache seguido de readCache hace round-trip de JSON arbitrario', async () => {
    await saveCache('devices:list', { items: [{ id: '1' }], nextCursor: null });
    await expect(readCache('devices:list')).resolves.toEqual({
      items: [{ id: '1' }],
      nextCursor: null,
    });
  });

  test('saveCache sobreescribe el valor previo de la misma key', async () => {
    await saveCache('devices:list', { v: 1 });
    await saveCache('devices:list', { v: 2 });
    await expect(readCache('devices:list')).resolves.toEqual({ v: 2 });
  });
});

describe('offline outbox', () => {
  test('pendingCount es 0 con un outbox vacío', async () => {
    await expect(pendingCount()).resolves.toBe(0);
  });

  test('enqueue incrementa pendingCount', async () => {
    await enqueue({ kind: 'alert:ack', payload: { alertId: 'a1' } });
    await expect(pendingCount()).resolves.toBe(1);
  });

  test('flushQueue elimina las acciones que el handler acepta, en orden de encolado', async () => {
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

  test('flushQueue deja las acciones rechazadas encoladas para el próximo flush', async () => {
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

  test('un handler que lanza excepción deja la acción encolada', async () => {
    await enqueue({ kind: 'alert:ack', payload: { alertId: 'boom' } });

    await flushQueue(async () => {
      throw new Error('network error');
    });

    expect(await pendingCount()).toBe(1);
  });
});
