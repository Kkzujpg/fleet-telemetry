"use client";

import { useEffect, useMemo, useRef } from "react";
import { io, Socket } from "socket.io-client";
import {
  AlertBroadcastPayload,
  PositionBroadcastPayload,
  SubscribeDevicePayload,
  WS_EVENTS,
} from "../../../shared/contract";
import { useSession } from "../session/session-context";
import { SocketContext } from "./socket-context";

const BACKEND_WS_URL = process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "http://localhost:3001";

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { status, apiFetch, getAccessToken } = useSession();
  const positionListeners = useRef(new Map<string, Set<(p: PositionBroadcastPayload) => void>>());
  const alertListeners = useRef(new Set<(a: AlertBroadcastPayload) => void>());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const socket: Socket = io(BACKEND_WS_URL, {
      // socket.io re-invokes this before every (re)connection attempt, so a
      // token that expired since the last attempt gets refreshed first - the
      // access token is what both HTTP and the socket handshake authenticate with.
      auth: async (cb) => {
        try {
          await apiFetch("/auth/me");
        } catch {
          // Refresh failed (e.g. logged out elsewhere) - connect with whatever
          // we have; the gateway will reject and stop reconnecting on 401.
        }
        cb({ token: getAccessToken() });
      },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      for (const deviceId of positionListeners.current.keys()) {
        socket.emit(WS_EVENTS.SUBSCRIBE_DEVICE, { deviceId } satisfies SubscribeDevicePayload);
      }
    });

    socket.on(WS_EVENTS.POSITION, (payload: PositionBroadcastPayload) => {
      positionListeners.current.get(payload.deviceId)?.forEach((cb) => cb(payload));
    });

    socket.on(WS_EVENTS.ALERT, (payload: AlertBroadcastPayload) => {
      alertListeners.current.forEach((cb) => cb(payload));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status, apiFetch, getAccessToken]);

  const value = useMemo(
    () => ({
      subscribeDevice(deviceId: string, onPosition: (p: PositionBroadcastPayload) => void) {
        let set = positionListeners.current.get(deviceId);
        if (!set) {
          set = new Set();
          positionListeners.current.set(deviceId, set);
          socketRef.current?.emit(WS_EVENTS.SUBSCRIBE_DEVICE, { deviceId } satisfies SubscribeDevicePayload);
        }
        set.add(onPosition);

        return () => {
          set!.delete(onPosition);
          if (set!.size === 0) {
            positionListeners.current.delete(deviceId);
            socketRef.current?.emit(WS_EVENTS.UNSUBSCRIBE_DEVICE, {
              deviceId,
            } satisfies SubscribeDevicePayload);
          }
        };
      },
      onAlert(callback: (a: AlertBroadcastPayload) => void) {
        alertListeners.current.add(callback);
        return () => {
          alertListeners.current.delete(callback);
        };
      },
    }),
    [],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
