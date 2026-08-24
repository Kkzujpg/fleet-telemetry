import { enqueue } from '../offline/offline';
import type { ApiClient } from '../auth/api-client';

function randomIdempotencyKey(): string {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AckAlertResult {
  queued: boolean;
}

/**
 * Reconoce una alerta de inmediato si hay conexión. Ante cualquier falla
 * (offline, error de red, error de servidor) el ack se encola en el outbox
 * en vez de lanzar excepción - el llamador puede vaciarlo después vía
 * flushAlertAcks contra el mismo endpoint idempotente (POST
 * /alerts/:id/ack), así que un ack hecho dos veces (una encolado, otra
 * reintentado) nunca se aplica doble.
 */
export async function ackAlert(apiFetch: ApiClient['apiFetch'], alertId: string): Promise<AckAlertResult> {
  const idempotencyKey = randomIdempotencyKey();
  try {
    await apiFetch(`/alerts/${alertId}/ack`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
    });
    return { queued: false };
  } catch {
    await enqueue({ kind: 'alert:ack', payload: { alertId, idempotencyKey } });
    return { queued: true };
  }
}
