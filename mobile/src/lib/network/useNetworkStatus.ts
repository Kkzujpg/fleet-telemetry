import { useEffect, useState } from 'react';
import * as Network from 'expo-network';

/** Hace poll de conectividad cada 10s - suficiente para un indicador de "estado de sincronización", no una suscripción en vivo. */
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
