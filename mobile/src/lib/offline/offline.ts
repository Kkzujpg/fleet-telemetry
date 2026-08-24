import * as SQLite from 'expo-sqlite';

// Misma convención de storage-key que web/lib/offline/offline.ts (ver
// CLAUDE.md: mantener las keys y formas de ambas copias sincronizadas a
// mano) - acá respaldado por expo-sqlite en vez de localStorage, así que
// cada operación es async. Implementa el requisito de "sincronización
// offline" de mobile (rúbrica).
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

// Cacheado entre llamadas - readCache/saveCache/enqueue/etc. se disparan
// todos al montar desde hooks independientes (lista de devices, alertas,
// conteo pendiente...), y abrir un SQLiteDatabase nuevo + correr CREATE
// TABLE por cada llamador concurrente compite por el handle nativo de
// Android (NullPointerException dentro de NativeDatabase.execAsync). Una
// única conexión compartida, abierta y migrada una sola vez, elimina la
// carrera.
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

/** Snapshot del último estado bueno conocido, indexado por lo que el llamador quiera cachear (ej: "devices:list"). */
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

/** Encola una acción realizada estando offline para reproducirla después (ej: un ack de alerta). */
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
 * Reproduce las acciones encoladas en orden. `handler` devuelve true una vez
 * que una acción se aplicó de forma segura y se elimina del outbox; lo que
 * el handler rechace con excepción o devuelva false se mantiene encolado
 * para el próximo flush.
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
      // se deja encolada para el próximo flush
    }
  }
}
