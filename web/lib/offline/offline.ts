// Misma convención de storage-key que mobile/lib/offline.ts (aún no
// construido) - ver CLAUDE.md. Si esto cambia, mantener las keys y formas de
// ambas copias sincronizadas a mano. Implementa el requisito de la rúbrica
// de "funcionalidad offline usando caché (localStorage)".
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
    // Storage no disponible (navegación privada, cuota) - se degrada a sin caché.
  }
}

/** Snapshot del último estado bueno conocido, indexado por lo que el llamador quiera cachear (ej: "devices:list"). */
export function saveCache<T>(key: string, data: T): void {
  const all = readJson<Record<string, unknown>>(CACHE_KEY) ?? {};
  all[key] = data;
  writeJson(CACHE_KEY, all);
}

export function readCache<T>(key: string): T | null {
  const all = readJson<Record<string, unknown>>(CACHE_KEY) ?? {};
  return (all[key] as T | undefined) ?? null;
}

/** Encola una acción realizada estando offline para reproducirla después (ej: un ack de alerta). */
export function enqueue(action: Omit<QueuedAction, "id" | "enqueuedAt">): void {
  const queue = readJson<QueuedAction[]>(QUEUE_KEY) ?? [];
  queue.push({ ...action, id: crypto.randomUUID(), enqueuedAt: new Date().toISOString() });
  writeJson(QUEUE_KEY, queue);
}

/**
 * Reproduce las acciones encoladas en orden. `handler` devuelve true una vez
 * que una acción se aplicó de forma segura; lo que quede sin procesar (el
 * handler lanzó excepción, o devolvió false) se mantiene encolado para el
 * próximo flush.
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
