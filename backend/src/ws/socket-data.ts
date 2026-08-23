import { Socket } from 'socket.io';
import {
  AlertBroadcastPayload,
  PositionBroadcastPayload,
  SubscribeDevicePayload,
} from '../../../shared/contract';
import { AccessTokenClaims } from '../auth/access-token.service';

export interface ClientToServerEvents {
  'subscribe:device': (payload: SubscribeDevicePayload) => void;
  'unsubscribe:device': (payload: SubscribeDevicePayload) => void;
}

export interface ServerToClientEvents {
  position: (payload: PositionBroadcastPayload) => void;
  alert: (payload: AlertBroadcastPayload) => void;
}

export type VerifiedClaims = AccessTokenClaims & { iat: number; exp: number };

export interface AuthenticatedSocketData {
  user: VerifiedClaims;
}

export type AuthenticatedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  AuthenticatedSocketData
>;
