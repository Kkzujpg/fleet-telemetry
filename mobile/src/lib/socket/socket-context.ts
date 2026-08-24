import { createContext, useContext } from 'react';
import type { AlertBroadcastPayload, PositionBroadcastPayload } from '../../../../shared/contract';

export interface SocketContextValue {
  subscribeDevice(deviceId: string, onPosition: (p: PositionBroadcastPayload) => void): () => void;
  onAlert(callback: (a: AlertBroadcastPayload) => void): () => void;
}

export const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return ctx;
}
