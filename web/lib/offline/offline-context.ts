import { createContext, useContext } from "react";

export interface OfflineContextValue {
  isOnline: boolean;
}

export const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error("useOffline must be used within an OfflineProvider");
  }
  return ctx;
}
