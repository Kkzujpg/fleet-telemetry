import { useCallback, useState } from 'react';
import { useSession } from '../auth/session-context';
import { ackAlert } from './ack';

/** Pending/queued ack state shared by the alerts screen and the fleet-screen alert strip. */
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
