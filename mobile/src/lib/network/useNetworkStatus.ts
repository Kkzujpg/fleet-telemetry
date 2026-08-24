import { useEffect, useState } from 'react';
import * as Network from 'expo-network';

/** Polls connectivity every 10s - good enough for a "sync status" indicator, not a live subscription. */
export function useNetworkStatus(): boolean | null {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const state = await Network.getNetworkStateAsync();
        if (mounted) {
          setIsConnected(Boolean(state.isConnected && state.isInternetReachable !== false));
        }
      } catch {
        if (mounted) {
          setIsConnected(null);
        }
      }
    }

    check();
    const interval = setInterval(check, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return isConnected;
}
