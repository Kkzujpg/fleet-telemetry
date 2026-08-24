import { createContext, useContext } from "react";
import type { AlertBroadcastPayload, PositionBroadcastPayload } from "../../../shared/contract";

export interface SocketContextValue {
  /** Se suscribe a actualizaciones de posición en vivo de un device; devuelve un cleanup para desuscribirse. */
  subscribeDevice: (deviceId: string, onPosition: (payload: PositionBroadcastPayload) => void) => () => void;
  /** Solo admin: se dispara en cada alerta nueva (el servidor solo las emite al room de admin). */
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
