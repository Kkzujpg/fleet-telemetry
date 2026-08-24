import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { AlertBroadcastPayload } from '../../../../shared/contract';
import type { ApiClient } from '../auth/api-client';
import { alertSeverityLabel, alertTypeLabel } from '../alerts/labels';
import { readCache } from '../offline/offline';
import type { ListDevicesResult } from '../types';

// Same cache key useDevices.ts writes to (CACHE_KEY there) - reading it here
// lets a notification name the vehicle without a network round-trip.
const DEVICES_CACHE_KEY = 'devices:list';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const ALERTS_CHANNEL_ID = 'alerts';

// Android 8+ ignores this priority-based popup behavior for any notification
// on the default channel - without an explicit high-importance channel,
// notifyAlert's notifications land silently in the tray instead of
// heads-up-popping over whatever screen is open.
if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync(ALERTS_CHANNEL_ID, {
    name: 'Alertas de flota',
    importance: Notifications.AndroidImportance.MAX,
    // No `sound` here - a string other than undefined is treated as a custom
    // sound filename that must be bundled via the config plugin. Omitting it
    // uses the system's default notification sound instead.
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#8798ff',
  });
}

/**
 * Registers this device's Expo push token against POST /push/register.
 * No-op on a simulator/emulator (no push capability) or without permission.
 * Remote push does not work in Expo Go on Android since SDK 53 -
 * getExpoPushTokenAsync throws there without a development build, which we
 * treat the same as "no token": registration silently skips, local
 * notifications (notifyAlert below) still work regardless.
 */
export async function registerPushToken(apiFetch: ApiClient['apiFetch']): Promise<void> {
  if (!Device.isDevice) {
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') {
    return;
  }

  let expoPushToken: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync();
    expoPushToken = result.data;
  } catch {
    return;
  }

  await apiFetch('/push/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expoPushToken, platform: Platform.OS === 'ios' ? 'ios' : 'android' }),
  });
}

/** Fires an immediate, heads-up local notification for an alert received live over the socket. */
export async function notifyAlert(alert: AlertBroadcastPayload): Promise<void> {
  // Several vehicles can cross the low-fuel threshold within the same
  // minute (e.g. right after a sim restart, when every tank starts full and
  // drains at the same rate) - without naming the vehicle, that batch reads
  // as one alert firing repeatedly instead of several distinct ones.
  const cachedDevices = await readCache<ListDevicesResult>(DEVICES_CACHE_KEY);
  const plate = cachedDevices?.items.find((d) => d.id === alert.deviceId)?.plate ?? null;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: plate ? `Alerta · ${plate}` : 'Nueva alerta de flota',
      body: `${alertTypeLabel(alert.type)} · ${alertSeverityLabel(alert.severity)}`,
      data: { alertId: alert.id, deviceId: alert.deviceId },
    },
    // channelId (not content.android.channelId) is what actually routes an
    // Android notification onto the high-importance channel above - this is
    // still an immediate trigger, just one that also names the channel.
    trigger: Platform.OS === 'android' ? { channelId: ALERTS_CHANNEL_ID } : null,
  });
}
