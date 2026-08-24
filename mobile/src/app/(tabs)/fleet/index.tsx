import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FleetMap } from '@/components/map/FleetMap';
import { OfflineBadge } from '@/components/ui/OfflineBadge';
import { Palette, Shadows } from '@/constants/theme';
import { useLiveDevices } from '@/lib/devices/useLiveDevices';

/** Landing screen for the Flota tab - full-bleed map with floating controls, no native header. */
export default function FleetMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { devices, loading } = useLiveDevices();

  if (loading && devices.length === 0) {
    return (
      <ThemedView style={styles.loading}>
        <ThemedText themeColor="textTertiary">Cargando posiciones…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      <FleetMap
        devices={devices}
        onSelectDevice={(id) => router.push({ pathname: '/fleet/[id]', params: { id } })}
      />

      <Pressable
        onPress={() => router.push('/fleet/list')}
        hitSlop={8}
        style={({ pressed }) => [
          styles.vehiclesButton,
          { top: insets.top + 10 },
          pressed && styles.vehiclesButtonPressed,
        ]}
      >
        <Ionicons name="car-sport" size={22} color={Palette.accent} />
      </Pressable>

      <View style={[styles.offlineSlot, { top: insets.top + 10 }]}>
        <OfflineBadge />
      </View>
    </View>
  );
}

const BUTTON_SIZE = 46;

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vehiclesButton: {
    position: 'absolute',
    left: 12,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: Palette.surface2,
    borderWidth: 1,
    borderColor: Palette.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  vehiclesButtonPressed: {
    backgroundColor: Palette.surface3,
    borderColor: Palette.accentRing,
  },
  offlineSlot: { position: 'absolute', right: 0 },
});
