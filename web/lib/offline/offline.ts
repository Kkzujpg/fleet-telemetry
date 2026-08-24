// Same storage-key convention as the (not yet built) mobile/lib/offline.ts -
// see CLAUDE.md. Keep both copies' keys and shapes in sync by hand if this
// changes.
const CACHE_KEY = "fleet_cache";
const QUEUE_KEY = "fleet_queue";

export interface QueuedAction {
  id: string;
  kind: string;
  payload: unknown;
  enqueuedAt: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private browsing, quota) - degrade to no cache.
  }
}

/** Last-known-good snapshot, keyed by whatever the caller wants to cache (e.g. "devices:list"). */
export function saveCache<T>(key: string, data: T): void {
  const all = readJson<Record<string, unknown>>(CACHE_KEY) ?? {};
  all[key] = data;
  writeJson(CACHE_KEY, all);
}

export function readCache<T>(key: string): T | null {
  const all = readJson<Record<string, unknown>>(CACHE_KEY) ?? {};
  return (all[key] as T | undefined) ?? null;
}

/** Buffers an action performed while offline for later replay (e.g. an alert ack). */
export function enqueue(action: Omit<QueuedAction, "id" | "enqueuedAt">): void {
  const queue = readJson<QueuedAction[]>(QUEUE_KEY) ?? [];
  queue.push({ ...action, id: crypto.randomUUID(), enqueuedAt: new Date().toISOString() });
  writeJson(QUEUE_KEY, queue);
}

/**
 * Replays queued actions in order. `handler` returns true once an action is
 * safely applied; anything left unprocessed (handler threw, or returned
 * false) stays queued for the next flush.
 */
export async function flushQueue(handler: (action: QueuedAction) => Promise<boolean>): Promise<void> {
  const queue = readJson<QueuedAction[]>(QUEUE_KEY) ?? [];
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    try {
      const ok = await handler(action);
      if (!ok) {
        remaining.push(action);
      }
    } catch {
      remaining.push(action);
    }
  }

  writeJson(QUEUE_KEY, remaining);
}
