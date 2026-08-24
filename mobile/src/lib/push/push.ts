import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { AlertBroadcastPayload } from '../../../../shared/contract';
import type { ApiClient } from '../auth/api-client';
import { alertSeverityLabel, alertTypeLabel } from '../alerts/labels';
import { readCache } from '../offline/offline';
import type { ListDevicesResult } from '../types';

// Misma cache key en la que escribe useDevices.ts (CACHE_KEY ahí) - leerla
// acá permite que una notificación nombre al vehículo sin un round-trip de red.
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

// Android 8+ ignora este comportamiento de popup basado en prioridad para
// cualquier notificación en el canal por defecto - sin un canal explícito de
// importancia alta, las notificaciones de notifyAlert caen en silencio a la
// bandeja en vez de aparecer como heads-up sobre la pantalla que esté abierta.
if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync(ALERTS_CHANNEL_ID, {
    name: 'Alertas de flota',
    importance: Notifications.AndroidImportance.MAX,
    // Sin `sound` acá - un string distinto de undefined se trata como un
    // nombre de archivo de sonido personalizado que debe empaquetarse vía el
    // config plugin. Omitirlo usa el sonido de notificación por defecto del
    // sistema.
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#8798ff',
  });
}

/**
 * Registra el Expo push token de este device contra POST /push/register.
 * No hace nada en un simulador/emulador (sin capacidad push) o sin permiso.
 * El push remoto no funciona en Expo Go en Android desde el SDK 53 -
 * getExpoPushTokenAsync lanza excepción ahí sin un development build, lo que
 * tratamos igual que "sin token": el registro se salta en silencio, las
 * notificaciones locales (notifyAlert más abajo) igual funcionan. Cumple el
 * requisito de "soporte para notificaciones push de alertas" de mobile.
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

/** Dispara una notificación local inmediata, tipo heads-up, para una alerta recibida en vivo por el socket. */
export async function notifyAlert(alert: AlertBroadcastPayload): Promise<void> {
  // Varios vehículos pueden cruzar el umbral de combustible bajo en el mismo
  // minuto (ej: justo después de reiniciar el simulador, cuando todos los
  // tanques arrancan llenos y se drenan a la misma tasa) - sin nombrar el
  // vehículo, ese lote se lee como una sola alerta disparándose repetidas
  // veces en vez de varias distintas.
  const cachedDevices = await readCache<ListDevicesResult>(DEVICES_CACHE_KEY);
  const plate = cachedDevices?.items.find((d) => d.id === alert.deviceId)?.plate ?? null;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: plate ? `Alerta · ${plate}` : 'Nueva alerta de flota',
      body: `${alertTypeLabel(alert.type)} · ${alertSeverityLabel(alert.severity)}`,
      data: { alertId: alert.id, deviceId: alert.deviceId },
    },
    // channelId (no content.android.channelId) es lo que realmente enruta
    // una notificación de Android al canal de importancia alta de arriba -
    // sigue siendo un trigger inmediato, solo que uno que también nombra el
    // canal.
    trigger: Platform.OS === 'android' ? { channelId: ALERTS_CHANNEL_ID } : null,
  });
}
