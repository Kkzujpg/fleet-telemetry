import { enqueue } from '../offline/offline';
import type { ApiClient } from '../auth/api-client';

function randomIdempotencyKey(): string {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AckAlertResult {
  queued: boolean;
}

/**
 * Acks an alert immediately if online. On any failure (offline, network
 * error, server error) the ack is queued in the outbox instead of thrown -
 * the caller can drain it later via flushAlertAcks against the same
 * idempotent endpoint (POST /alerts/:id/ack), so an ack made twice (once
 * queued, once retried) never double-applies.
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
