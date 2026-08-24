import { StyleSheet, Text, View } from 'react-native';

import { Palette, Radii } from '@/constants/theme';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

/** Indicador a la derecha del header, mostrado solo estando offline - refleja el badge "Sin conexión" del AppShell de web. */
export function OfflineBadge() {
  const isConnected = useNetworkStatus();

  if (isConnected !== false) {
    return null;
  }

  return (
    <View style={styles.badge}>
      <Text style={styles.label}>Sin conexión</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    marginRight: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radii.pill,
    backgroundColor: Palette.statusStaleSoft,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Palette.statusStale,
  },
});
