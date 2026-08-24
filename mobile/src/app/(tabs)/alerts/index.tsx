import { useMemo } from 'react';
import { Redirect } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Palette, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';
import { useAlerts } from '@/lib/alerts/useAlerts';
import { useAlertAck } from '@/lib/alerts/useAlertAck';
import { alertSeverityLabel, alertTypeLabel } from '@/lib/alerts/labels';
import type { AlertView } from '@/lib/types';

function severityTokens(severity: string) {
  return severity === 'CRITICAL'
    ? { fg: Palette.statusCritical, bg: Palette.statusCriticalSoft }
    : { fg: Palette.statusStale, bg: Palette.statusStaleSoft };
}

export default function AlertsScreen() {
  const { user } = useSession();
  const { data, loading, refreshing, error, refresh } = useAlerts();
  const { pendingIds, queuedIds, handleAck } = useAlertAck(refresh);
  // El backend devuelve createdAt ascendente (su paginación por cursor
  // depende de esa dirección) - más-reciente-primero en esta pantalla es
  // solo una inversión de visualización, no un cambio en el orden de
  // paginación.
  const items = useMemo(() => [...(data?.items ?? [])].reverse(), [data]);

  // El tab está oculto para no-ADMIN en (tabs)/_layout.tsx, pero eso solo
  // oculta la entrada de la tab bar - hay que proteger también la ruta en sí
  // ante navegación directa.
  if (user && user.role !== 'ADMIN') {
    return <Redirect href="/(tabs)/fleet" />;
  }

  return (
    <ThemedView style={styles.container}>
      {error && (
        <ThemedText type="small" themeColor="statusStale" style={styles.banner}>
          {error} · mostrando datos en caché
        </ThemedText>
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Palette.accent} />}
        ListEmptyComponent={
          !loading ? (
            <ThemedText themeColor="textTertiary" style={styles.empty}>
              Sin alertas activas
            </ThemedText>
          ) : null
        }
        renderItem={({ item }: { item: AlertView }) => {
          const tokens = severityTokens(item.severity);
          return (
            <Card style={styles.card}>
              <Pill label={alertSeverityLabel(item.severity)} fg={tokens.fg} bg={tokens.bg} />
              <ThemedText type="smallBold">{alertTypeLabel(item.type)}</ThemedText>
              <ThemedText type="small" themeColor="textTertiary">
                {new Date(item.createdAt).toLocaleString()}
              </ThemedText>
              {item.distanceRemainingKm !== null && (
                <ThemedText type="mono" themeColor="textSecondary">
                  {item.distanceRemainingKm} km restantes
                </ThemedText>
              )}
              {item.acknowledgedAt ? (
                <ThemedText type="small" themeColor="statusOnline">
                  Reconocida
                </ThemedText>
              ) : queuedIds.has(item.id) ? (
                <ThemedText type="small" themeColor="textTertiary">
                  Pendiente de sincronizar
                </ThemedText>
              ) : (
                <Pressable onPress={() => handleAck(item.id)} disabled={pendingIds.has(item.id)}>
                  <ThemedText type="linkPrimary">{pendingIds.has(item.id) ? 'Enviando…' : 'Reconocer'}</ThemedText>
                </Pressable>
              )}
            </Card>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  card: { padding: Spacing.three, gap: Spacing.one, marginBottom: Spacing.two },
  banner: { padding: Spacing.two, paddingHorizontal: Spacing.three },
  empty: { padding: Spacing.four, textAlign: 'center' },
});
