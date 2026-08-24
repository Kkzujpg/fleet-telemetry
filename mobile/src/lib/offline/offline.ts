import * as SQLite from 'expo-sqlite';

// Same storage-key convention as web/lib/offline/offline.ts (see CLAUDE.md:
// keep both copies' keys and shapes in sync by hand) - here backed by
// expo-sqlite instead of localStorage, so every op is async.
const DB_NAME = 'fleet_offline.db';

export interface QueuedAction {
  id: string;
  kind: string;
  payload: unknown;
  enqueuedAt: string;
}

interface CacheRow {
  data: string;
}

interface OutboxRow {
  id: string;
  kind: string;
  payload: string;
  enqueued_at: string;
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Cached across calls - readCache/saveCache/enqueue/etc. all fire on mount
// from independent hooks (devices list, alerts, pending count...), and
// opening a fresh SQLiteDatabase + running CREATE TABLE per concurrent
// caller races on Android's native db handle (NullPointerException inside
// NativeDatabase.execAsync). One shared connection, opened and migrated
// once, removes the race.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, enqueued_at TEXT NOT NULL);`,
      );
      return db;
    })();
  }
  return dbPromise;
}

/** Last-known-good snapshot, keyed by whatever the caller wants to cache (e.g. "devices:list"). */
export async function saveCache<T>(key: string, data: T): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO cache (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data',
    key,
    JSON.stringify(data),
  );
}

export async function readCache<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CacheRow>('SELECT data FROM cache WHERE key = ?', key);
  return row ? (JSON.parse(row.data) as T) : null;
}

/** Buffers an action performed while offline for later replay (e.g. an alert ack). */
export async function enqueue(action: Omit<QueuedAction, 'id' | 'enqueuedAt'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO outbox (id, kind, payload, enqueued_at) VALUES (?, ?, ?, ?)',
    randomId(),
    action.kind,
    JSON.stringify(action.payload),
    new Date().toISOString(),
  );
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM outbox');
  return row?.count ?? 0;
}

/**
 * Replays queued actions in order. `handler` returns true once an action is
 * safely applied and gets deleted from the outbox; anything the handler
 * throws on or returns false for stays queued for the next flush.
 */
export async function flushQueue(handler: (action: QueuedAction) => Promise<boolean>): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY enqueued_at ASC');

  for (const row of rows) {
    const action: QueuedAction = {
      id: row.id,
      kind: row.kind,
      payload: JSON.parse(row.payload),
      enqueuedAt: row.enqueued_at,
    };
    try {
      const ok = await handler(action);
      if (ok) {
        await db.runAsync('DELETE FROM outbox WHERE id = ?', row.id);
      }
    } catch {
      // leave it queued for the next flush
    }
  }
}
