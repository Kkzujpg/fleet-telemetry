// expo-device se lee de forma perezosa (dentro del cuerpo de
// registerPushToken), así que mutar este objeto compartido entre tests es
// seguro - a diferencia de expo-notifications más abajo, nada acá corre en
// tiempo de evaluación del módulo.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { notifyAlert, registerPushToken } from './push';

const mockDeviceState: { isDevice: boolean } = { isDevice: true };
jest.mock('expo-device', () => ({
  __esModule: true,
  get isDevice() {
    return mockDeviceState.isDevice;
  },
}));

// push.ts llama a Notifications.setNotificationHandler en el nivel superior
// del módulo, así que esta factory debe ser completamente autocontenida (sin
// referencias a variables externas) - referenciar un const externo acá se
// leería como undefined, ya que las factories de jest.mock corren cuando el
// módulo se requiere por primera vez, lo cual - por el hoisting de imports -
// sucede antes de que se inicialice cualquier `const` posterior de este archivo.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));

jest.mock('../offline/offline', () => ({
  readCache: jest.fn(),
}));

const getPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;
const requestPermissionsAsync = Notifications.requestPermissionsAsync as jest.Mock;
const getExpoPushTokenAsync = Notifications.getExpoPushTokenAsync as jest.Mock;
const scheduleNotificationAsync = Notifications.scheduleNotificationAsync as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- módulo mockeado, no se necesita import con tipos
const readCache = require('../offline/offline').readCache as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockDeviceState.isDevice = true;
  readCache.mockResolvedValue(null);
});

describe('registerPushToken', () => {
  test('se salta en un simulador/emulador', async () => {
    mockDeviceState.isDevice = false;
    const apiFetch = jest.fn();

    await registerPushToken(apiFetch);

    expect(apiFetch).not.toHaveBeenCalled();
    expect(getPermissionsAsync).not.toHaveBeenCalled();
  });

  test('pide permiso si aún no fue otorgado, y luego registra', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    const apiFetch = jest.fn().mockResolvedValue({ ok: true });

    await registerPushToken(apiFetch);

    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
    const expectedPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
    expect(apiFetch).toHaveBeenCalledWith(
      '/push/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expoPushToken: 'ExponentPushToken[abc]', platform: expectedPlatform }),
      }),
    );
  });

  test('no registra cuando el permiso es denegado', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const apiFetch = jest.fn();

    await registerPushToken(apiFetch);

    expect(apiFetch).not.toHaveBeenCalled();
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  test('el registro no hace nada en silencio si getExpoPushTokenAsync lanza excepción (ej: Expo Go en Android)', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getExpoPushTokenAsync.mockRejectedValue(new Error('no push in Expo Go'));
    const apiFetch = jest.fn();

    await expect(registerPushToken(apiFetch)).resolves.toBeUndefined();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('notifyAlert', () => {
  test('programa una notificación local inmediata con los datos de la alerta', async () => {
    await notifyAlert({
      id: 'alert-1',
      deviceId: 'device-1',
      type: 'LOW_FUEL',
      severity: 'CRITICAL',
      predictedEmptyAt: null,
      distanceRemainingKm: 5,
      createdAt: '2026-08-23T12:00:00.000Z',
    });

    const expectedTrigger = Platform.OS === 'android' ? { channelId: 'alerts' } : null;
    expect(scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Nueva alerta de flota',
        body: 'Combustible bajo · Crítica',
        data: { alertId: 'alert-1', deviceId: 'device-1' },
      },
      trigger: expectedTrigger,
    });
  });

  test('nombra al vehículo en el título cuando su placa está en la lista de devices cacheada', async () => {
    readCache.mockResolvedValue({ items: [{ id: 'device-1', plate: 'ABC123' }], nextCursor: null });

    await notifyAlert({
      id: 'alert-1',
      deviceId: 'device-1',
      type: 'LOW_FUEL',
      severity: 'CRITICAL',
      predictedEmptyAt: null,
      distanceRemainingKm: 5,
      createdAt: '2026-08-23T12:00:00.000Z',
    });

    expect(scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ title: 'Alerta · ABC123' }) }),
    );
  });
});
