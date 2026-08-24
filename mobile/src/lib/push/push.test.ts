// expo-device is read lazily (inside registerPushToken's body), so mutating
// this shared object between tests is safe - unlike expo-notifications below,
// nothing here runs at module-evaluation time.
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

// push.ts calls Notifications.setNotificationHandler at module top level, so
// this factory must be fully self-contained (no outer variable reference) -
// referencing an outer const here would read as undefined, since jest.mock
// factories run when the module is first required, which - because imports
// are hoisted - happens before any later `const` in this file is initialized.
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
// eslint-disable-next-line @typescript-eslint/no-require-imports -- mocked module, no type-safe import needed
const readCache = require('../offline/offline').readCache as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockDeviceState.isDevice = true;
  readCache.mockResolvedValue(null);
});

describe('registerPushToken', () => {
  test('skips on a simulator/emulator', async () => {
    mockDeviceState.isDevice = false;
    const apiFetch = jest.fn();

    await registerPushToken(apiFetch);

    expect(apiFetch).not.toHaveBeenCalled();
    expect(getPermissionsAsync).not.toHaveBeenCalled();
  });

  test('requests permission when not already granted, then registers', async () => {
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

  test('does not register when permission is denied', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const apiFetch = jest.fn();

    await registerPushToken(apiFetch);

    expect(apiFetch).not.toHaveBeenCalled();
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  test('registration silently no-ops if getExpoPushTokenAsync throws (e.g. Expo Go on Android)', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getExpoPushTokenAsync.mockRejectedValue(new Error('no push in Expo Go'));
    const apiFetch = jest.fn();

    await expect(registerPushToken(apiFetch)).resolves.toBeUndefined();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('notifyAlert', () => {
  test('schedules an immediate local notification with the alert data', async () => {
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

  test('names the vehicle in the title when its plate is in the cached device list', async () => {
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
