import { flushQueue, QueuedAction } from '../offline/offline';
import type { ApiClient } from '../auth/api-client';

interface AlertAckPayload {
  alertId: string;
  idempotencyKey: string;
}

function isAlertAckPayload(payload: unknown): payload is AlertAckPayload {
  const p = payload as Partial<AlertAckPayload> | null;
  return typeof p === 'object' && p !== null && typeof p.alertId === 'string' && typeof p.idempotencyKey === 'string';
}

/** Vacía los acks de alerta encolados contra el backend. Deja encolado para el próximo flush lo que no pueda aplicar. */
export async function flushAlertAcks(apiFetch: ApiClient['apiFetch']): Promise<void> {
  await flushQueue(async (action: QueuedAction) => {
    if (action.kind !== 'alert:ack' || !isAlertAckPayload(action.payload)) {
      // Kind de acción desconocido/mal formado - se descarta en vez de reintentar para siempre.
      return true;
    }
    try {
      await apiFetch(`/alerts/${action.payload.alertId}/ack`, {
        method: 'POST',
        headers: { 'idempotency-key': action.payload.idempotencyKey },
      });
      return true;
    } catch {
      return false;
    }
  });
}
