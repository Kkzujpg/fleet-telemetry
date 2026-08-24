import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { AlertsStrip } from '@/components/alerts/AlertsStrip';
import { Palette, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { useDevices } from '@/lib/devices/useDevices';
import type { DeviceListItem } from '@/lib/types';

const STATUS_LABEL: Record<string, string> = {
  online: 'En línea',
  stale: 'Señal débil',
  offline: 'Sin señal',
};

export default function FleetListScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { data, loading, refreshing, error, refresh } = useDevices();

  return (
    <ThemedView style={styles.container}>
      {user?.role === 'ADMIN' && <AlertsStrip devices={data?.items ?? []} />}

      {error && (
        <ThemedText type="small" themeColor="statusStale" style={styles.banner}>
          {error} · mostrando datos en caché
        </ThemedText>
      )}

      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Palette.accent} />}
        ListEmptyComponent={
          !loading ? (
            <ThemedText themeColor="textTertiary" style={styles.empty}>
              Sin vehículos
            </ThemedText>
          ) : null
        }
        renderItem={({ item }: { item: DeviceListItem }) => (
          <Pressable onPress={() => router.push({ pathname: '/fleet/[id]', params: { id: item.id } })}>
            <Card style={styles.card}>
              <View style={styles.cardMain}>
                <StatusDot status={item.connectivityStatus} />
                <ThemedText type="smallBold" style={styles.plate} numberOfLines={1}>
                  {item.plate}
                </ThemedText>
                <ThemedText type="mono" themeColor="textSecondary">
                  {item.latestReading ? `${item.latestReading.speedKph.toFixed(0)} km/h` : '—'}
                </ThemedText>
              </View>
              <View style={styles.cardFooter}>
                <ThemedText type="small" themeColor="textTertiary">
                  {STATUS_LABEL[item.connectivityStatus] ?? item.connectivityStatus}
                  {item.latestReading ? ` · ${item.latestReading.fuelLevelPct.toFixed(0)}% combustible` : ''}
                </ThemedText>
                <ThemedText type="small" themeColor="textTertiary">
                  {item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleTimeString() : 'nunca visto'}
                </ThemedText>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  card: { marginBottom: Spacing.two },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: Spacing.three },
  plate: { flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Palette.borderSubtle,
  },
  banner: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  empty: { padding: Spacing.four, textAlign: 'center' },
});
