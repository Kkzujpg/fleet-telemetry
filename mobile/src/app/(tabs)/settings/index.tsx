import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/Card';
import { Palette, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';
import { usePendingCount } from '@/lib/offline/usePendingCount';
import { flushAlertAcks } from '@/lib/alerts/flush';

const CONNECTIVITY_LABEL: Record<'online' | 'offline' | 'unknown', string> = {
  online: 'En línea',
  offline: 'Sin conexión',
  unknown: 'Estado desconocido',
};

export default function SettingsScreen() {
  const { user, apiFetch, logout } = useSession();
  const isConnected = useNetworkStatus();
  const { count, refresh } = usePendingCount();

  useEffect(() => {
    if (isConnected) {
      flushAlertAcks(apiFetch)
        .then(refresh)
        .catch(() => undefined);
    }
  }, [isConnected, apiFetch, refresh]);

  const connectivityKey = isConnected === null ? 'unknown' : isConnected ? 'online' : 'offline';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Card style={styles.card}>
          <ThemedText type="smallBold">Sesión</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {user?.email}
          </ThemedText>
          <ThemedText type="small" themeColor="textTertiary">
            Rol: {user?.role}
          </ThemedText>
        </Card>

        <Card style={styles.card}>
          <ThemedText type="smallBold">Sincronización</ThemedText>
          <View style={styles.row}>
            <View style={[styles.statusDot, connectivityKey === 'online' && styles.statusDotOnline]} />
            <ThemedText type="small">{CONNECTIVITY_LABEL[connectivityKey]}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {count} operación{count === 1 ? '' : 'es'} pendiente{count === 1 ? '' : 's'} en el outbox
          </ThemedText>
        </Card>

        <Pressable style={styles.button} onPress={() => logout()}>
          <ThemedText type="link" themeColor="statusCritical" style={styles.logout}>
            Cerrar sesión
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.three, gap: Spacing.three },
  card: { padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Palette.statusOffline },
  statusDotOnline: { backgroundColor: Palette.statusOnline },
  button: { marginTop: Spacing.two, alignSelf: 'flex-start' },
  logout: { fontWeight: '600' },
});
