import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import {
  ADMIN_ROOM,
  AlertBroadcastPayload,
  PositionBroadcastPayload,
  SubscribeDevicePayload,
  WS_EVENTS,
  deviceRoom,
} from '../../../shared/contract';
import { createCoalescingThrottle } from '../../../shared/coalescing-throttle';
import { AccessTokenService } from '../auth/access-token.service';
import { AuthenticatedSocket, VerifiedClaims } from './socket-data';

const POSITION_THROTTLE_MS = 1000;

@WebSocketGateway({ cors: { origin: '*' } })
export class TelemetryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly emitPosition = createCoalescingThrottle<string, PositionBroadcastPayload>(
    (deviceId, payload) => {
      this.server.to(deviceRoom(deviceId)).emit(WS_EVENTS.POSITION, payload);
    },
    POSITION_THROTTLE_MS,
  );

  constructor(private readonly accessTokens: AccessTokenService) {}

  handleConnection(socket: AuthenticatedSocket): void {
    const token = socket.handshake.auth?.token;

    if (typeof token !== 'string') {
      socket.disconnect(true);
      return;
    }

    let claims: VerifiedClaims;
    try {
      claims = this.accessTokens.verify(token);
    } catch {
      socket.disconnect(true);
      return;
    }

    socket.data.user = claims;

    if (claims.role === 'ADMIN') {
      void socket.join(ADMIN_ROOM);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const msUntilExpiry = Math.max((claims.exp - nowSec) * 1000, 0);
    const timer = setTimeout(() => socket.disconnect(true), msUntilExpiry);
    timer.unref();
    this.expiryTimers.set(socket.id, timer);
  }

  handleDisconnect(socket: AuthenticatedSocket): void {
    const timer = this.expiryTimers.get(socket.id);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(socket.id);
    }
  }

  @SubscribeMessage(WS_EVENTS.SUBSCRIBE_DEVICE)
  handleSubscribeDevice(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: SubscribeDevicePayload,
  ): void {
    if (!payload || typeof payload.deviceId !== 'string' || payload.deviceId.length === 0) {
      return;
    }
    void socket.join(deviceRoom(payload.deviceId));
  }

  @SubscribeMessage(WS_EVENTS.UNSUBSCRIBE_DEVICE)
  handleUnsubscribeDevice(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: SubscribeDevicePayload,
  ): void {
    if (!payload || typeof payload.deviceId !== 'string' || payload.deviceId.length === 0) {
      return;
    }
    void socket.leave(deviceRoom(payload.deviceId));
  }

  broadcastReading(deviceId: string, reading: Omit<PositionBroadcastPayload, 'deviceId'>): void {
    this.emitPosition(deviceId, { deviceId, ...reading });
  }

  broadcastAlert(alert: AlertBroadcastPayload): void {
    this.server.to(ADMIN_ROOM).emit(WS_EVENTS.ALERT, alert);
  }
}
