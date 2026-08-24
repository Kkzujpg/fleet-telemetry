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

/** Drains queued alert acks against the backend. Leaves anything it can't apply queued for the next flush. */
export async function flushAlertAcks(apiFetch: ApiClient['apiFetch']): Promise<void> {
  await flushQueue(async (action: QueuedAction) => {
    if (action.kind !== 'alert:ack' || !isAlertAckPayload(action.payload)) {
      // Unknown/malformed action kind - drop it rather than retry forever.
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
