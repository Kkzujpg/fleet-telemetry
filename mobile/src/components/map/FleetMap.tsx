import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, type CameraRef, Map, Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { Fonts, Palette, Radii, Shadows, Spacing } from '@/constants/theme';
import type { DeviceListItem } from '@/lib/types';

// Same open vector tile style as web/components/map/FleetMap.tsx - no API key needed.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

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
  /** When set (or when `devices` holds exactly one vehicle), the camera follows that vehicle's live position. */
  selectedDeviceId?: string | null;
  /** Tapping a vehicle's callout calls this instead of just closing it - e.g. navigate to its detail screen. */
  onSelectDevice?: (deviceId: string) => void;
}

export function FleetMap({ devices, selectedDeviceId = null, onSelectDevice }: FleetMapProps) {
  const cameraRef = useRef<CameraRef>(null);
  const flownForRef = useRef<string | null>(null);
  const flownToFleetRef = useRef(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Camera commands issued before the native style finishes loading are
  // silently dropped, not queued - gate every flyTo/easeTo on this instead of
  // firing as soon as `located` arrives, or a fast device fetch racing a
  // slower tile/style load leaves the camera stuck at its initial view.
  const [styleLoaded, setStyleLoaded] = useState(false);

  const located = useMemo(() => devices.filter(hasReading), [devices]);

  const soleDevice = located.length === 1 ? located[0] : null;
  const tracked = soleDevice ?? located.find((d) => d.id === selectedDeviceId) ?? null;
  const trackedReadingKey = tracked?.latestReading.recordedAt ?? null;

  // Single tracked vehicle (detail screen, or a selection on the fleet map):
  // fly in the first time, then ease-follow on every later reading - mirrors
  // web/components/map/FleetMap.tsx's flyTo-once/easeTo-after pattern.
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

  // Whole-fleet view (no single tracked vehicle): center once on the fleet's
  // centroid as soon as positions arrive, then leave the camera alone -
  // recentering on every tick here would fight the user panning the map.
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
            // Tap handled on the Marker itself, not a nested Pressable - the
            // native annotation view owns the hit test, and a child
            // touchable's onPress isn't reliably forwarded through it.
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
