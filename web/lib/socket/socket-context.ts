import { createContext, useContext } from "react";
import type { AlertBroadcastPayload, PositionBroadcastPayload } from "../../../shared/contract";

export interface SocketContextValue {
  /** Subscribes to live position updates for one device; returns an unsubscribe cleanup. */
  subscribeDevice: (deviceId: string, onPosition: (payload: PositionBroadcastPayload) => void) => () => void;
  /** Admin-only: fires on every new alert (server only emits these to the admin room). */
  onAlert: (callback: (alert: AlertBroadcastPayload) => void) => () => void;
}

export const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return ctx;
}
