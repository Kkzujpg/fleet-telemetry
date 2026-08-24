import { useCallback, useState } from 'react';
import { useSession } from '../auth/session-context';
import { ackAlert } from './ack';

/** Estado de ack pendiente/encolado, compartido entre la pantalla de alertas y el strip de alertas de la pantalla de flota. */
export function useAlertAck(refresh: () => Promise<void>) {
  const { apiFetch } = useSession();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());

  const handleAck = useCallback(
    async (alertId: string) => {
      setPendingIds((prev) => new Set(prev).add(alertId));
      try {
        const { queued } = await ackAlert(apiFetch, alertId);
        if (queued) {
          setQueuedIds((prev) => new Set(prev).add(alertId));
        } else {
          await refresh();
        }
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(alertId);
          return next;
        });
      }
    },
    [apiFetch, refresh],
  );

  return { pendingIds, queuedIds, handleAck };
}
