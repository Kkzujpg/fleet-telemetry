import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, type CameraRef, Map, Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { Fonts, Palette, Radii, Shadows, Spacing } from '@/constants/theme';
import type { DeviceListItem } from '@/lib/types';

// Mismo estilo de tiles vectoriales abierto que web/components/map/FleetMap.tsx - sin necesidad de API key.
const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const STATUS_COLOR: Record<DeviceListItem['connectivityStatus'], string> = {
  online: Palette.statusOnline,
  stale: Palette.statusStale,
  offline: Palette.statusOffline,
};

type LocatedDevice = DeviceListItem & { latestReading: NonNullable<DeviceListItem['latestReading']> };

function hasReading(device: DeviceListItem): device is LocatedDevice {
  return device.latestReading !== null;
}

export interface FleetMapProps {
  devices: DeviceListItem[];
  /** Cuando está seteado (o cuando `devices` tiene exactamente un vehículo), la cámara sigue la posición en vivo de ese vehículo. */
  selectedDeviceId?: string | null;
  /** Tocar el callout de un vehículo llama a esto en vez de solo cerrarlo - ej: navegar a su pantalla de detalle. */
  onSelectDevice?: (deviceId: string) => void;
}

export function FleetMap({ devices, selectedDeviceId = null, onSelectDevice }: FleetMapProps) {
  const cameraRef = useRef<CameraRef>(null);
  const flownForRef = useRef<string | null>(null);
  const flownToFleetRef = useRef(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Los comandos de cámara emitidos antes de que el estilo nativo termine de
  // cargar se descartan en silencio, no se encolan - se condiciona cada
  // flyTo/easeTo a esto en vez de dispararlo apenas llega `located`, o un
  // fetch de devices rápido compitiendo con una carga de tile/estilo más
  // lenta deja la cámara atascada en su vista inicial.
  const [styleLoaded, setStyleLoaded] = useState(false);

  const located = useMemo(() => devices.filter(hasReading), [devices]);

  const soleDevice = located.length === 1 ? located[0] : null;
  const tracked = soleDevice ?? located.find((d) => d.id === selectedDeviceId) ?? null;
  const trackedReadingKey = tracked?.latestReading.recordedAt ?? null;

  // Un solo vehículo rastreado (pantalla de detalle, o una selección en el
  // mapa de flota): flyTo la primera vez, luego ease-follow en cada lectura
  // posterior - refleja el patrón flyTo-una-vez/easeTo-después de
  // web/components/map/FleetMap.tsx.
  useEffect(() => {
    if (!tracked || !styleLoaded) {
      return;
    }
    const center: LngLat = [tracked.latestReading.lng, tracked.latestReading.lat];
    if (flownForRef.current !== tracked.id) {
      flownForRef.current = tracked.id;
      cameraRef.current?.flyTo({ center, zoom: 14, duration: 800 });
    } else {
      cameraRef.current?.easeTo({ center, zoom: 14, duration: 500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked?.id, trackedReadingKey, styleLoaded]);

  // Vista de flota completa (sin un solo vehículo rastreado): centra una vez
  // en el centroide de la flota apenas llegan posiciones, y después deja la
  // cámara en paz - re-centrar en cada tick acá pelearía con el usuario
  // paneando el mapa.
  useEffect(() => {
    if (tracked || !styleLoaded || flownToFleetRef.current || located.length === 0) {
      return;
    }
    flownToFleetRef.current = true;
    const center: LngLat = [
      located.reduce((sum, d) => sum + d.latestReading.lng, 0) / located.length,
      located.reduce((sum, d) => sum + d.latestReading.lat, 0) / located.length,
    ];
    cameraRef.current?.flyTo({ center, zoom: 5, duration: 800 });
  }, [tracked, located, styleLoaded]);

  return (
    <Map mapStyle={STYLE_URL} style={styles.map} onDidFinishLoadingStyle={() => setStyleLoaded(true)}>
      <Camera ref={cameraRef} initialViewState={{ center: [0, 0], zoom: 1 }} />

      {located.map((device) => (
        <Marker
          key={device.id}
          lngLat={[device.latestReading.lng, device.latestReading.lat]}
          anchor="center"
          onPress={() => setOpenId((prev) => (prev === device.id ? null : device.id))}
        >
          <View style={[styles.pin, { backgroundColor: STATUS_COLOR[device.connectivityStatus] }]} />
        </Marker>
      ))}

      {located
        .filter((device) => device.id === openId)
        .map((device) => (
          <Marker
            key={`${device.id}-callout`}
            lngLat={[device.latestReading.lng, device.latestReading.lat]}
            anchor="bottom"
            offset={[0, -16]}
            // El tap se maneja en el propio Marker, no en un Pressable
            // anidado - la vista nativa de anotación es dueña del hit test,
            // y el onPress de un touchable hijo no se reenvía de forma
            // confiable a través de ella.
            onPress={() => (onSelectDevice ? onSelectDevice(device.id) : setOpenId(null))}
          >
            <View style={styles.callout}>
              <View style={styles.calloutHeader}>
                <View style={[styles.calloutDot, { backgroundColor: STATUS_COLOR[device.connectivityStatus] }]} />
                <Text style={styles.calloutTitle}>{device.plate}</Text>
              </View>
              <Text style={styles.calloutText}>
                {device.latestReading.speedKph.toFixed(0)} km/h · {device.latestReading.fuelLevelPct.toFixed(0)}%
              </Text>
              {onSelectDevice && <Text style={styles.calloutLink}>Ver detalle ›</Text>}
            </View>
          </Marker>
        ))}
    </Map>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  pin: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: Palette.bg, ...Shadows.sm },
  callout: {
    backgroundColor: Palette.surface2,
    borderWidth: 1,
    borderColor: Palette.borderMedium,
    borderRadius: Radii.md,
    padding: 10,
    minWidth: 130,
    ...Shadows.md,
  },
  calloutHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  calloutDot: { width: 7, height: 7, borderRadius: 3.5 },
  calloutTitle: { fontWeight: '700', color: Palette.textPrimary, fontSize: 13.5 },
  calloutText: { color: Palette.textSecondary, fontSize: 12, fontFamily: Fonts.mono },
  calloutLink: { color: Palette.accent, fontSize: 12, fontWeight: '600', marginTop: Spacing.half },
});
