import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { TelemetryGateway } from '../../src/ws/telemetry.gateway';
import { sign } from '../../../shared/jwt';
import { AlertBroadcastPayload, WS_EVENTS } from '../../../shared/contract';

const JWT_SECRET = 'ws-gateway-test-secret';

function waitForEvent<T = unknown>(socket: Socket, event: string, timeoutMs = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function noEventArrives(socket: Socket, event: string, waitMs = 300): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, waitMs);
    socket.once(event, () => {
      clearTimeout(timer);
      reject(new Error(`unexpected "${event}" event received`));
    });
  });
}

describe('TelemetryGateway (integration)', () => {
  let app: INestApplication;
  let gateway: TelemetryGateway;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
    gateway = app.get(TelemetryGateway);
  });

  afterAll(async () => {
    const httpServer = app.getHttpServer();
    await app.close();
    httpServer.closeAllConnections?.();
  });

  function connect(role: string): Socket {
    const token = sign({ sub: `user-${role}`, role }, JWT_SECRET, 60);
    return io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
  }

  test('only the ADMIN socket receives a broadcast alert; the VIEWER socket does not', async () => {
    const admin = connect('ADMIN');
    const viewer = connect('VIEWER');

    await Promise.all([waitForEvent(admin, 'connect'), waitForEvent(viewer, 'connect')]);

    const alertReceived = waitForEvent<AlertBroadcastPayload>(admin, WS_EVENTS.ALERT);
    const viewerSilent = noEventArrives(viewer, WS_EVENTS.ALERT);

    const alert: AlertBroadcastPayload = {
      id: 'alert-1',
      deviceId: 'device-uuid-1',
      type: 'LOW_FUEL',
      severity: 'critical',
      predictedEmptyAt: null,
      distanceRemainingKm: 12,
      createdAt: new Date().toISOString(),
    };
    gateway.broadcastAlert(alert);

    const [received] = await Promise.all([alertReceived, viewerSilent]);
    expect(received).toEqual(alert);

    admin.disconnect();
    viewer.disconnect();
  });

  test('position broadcasts never carry a publicId-shaped id', async () => {
    const viewer = connect('VIEWER');
    await waitForEvent(viewer, 'connect');

    const deviceId = 'device-uuid-2';
    viewer.emit(WS_EVENTS.SUBSCRIBE_DEVICE, { deviceId });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const positionReceived = waitForEvent(viewer, WS_EVENTS.POSITION);
    gateway.broadcastReading(deviceId, {
      lat: 10.5,
      lng: -66.9,
      speedKph: 42,
      fuelLiters: 30.2,
      engineTempC: 85,
      recordedAt: new Date().toISOString(),
    });

    const payload = await positionReceived;
    expect(JSON.stringify(payload)).not.toMatch(/DEV-\d/);

    viewer.disconnect();
  });

  test('a connection with an invalid token is rejected without emitting anything', async () => {
    const socket = io(baseUrl, {
      auth: { token: 'not-a-real-token' },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    await waitForEvent(socket, 'disconnect', 2000);
    socket.close();
  });
});
