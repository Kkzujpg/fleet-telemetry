import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { Pill } from '@/components/ui/Pill';
import { DeviceHistoryCharts } from '@/components/devices/DeviceHistoryCharts';
import { Palette, Radii, Spacing } from '@/constants/theme';
import { useDeviceDetail } from '@/lib/devices/useDeviceDetail';
import { applyPosition } from '@/lib/devices/applyPosition';
import { useSocket } from '@/lib/socket/socket-context';
import { FleetMap } from '@/components/map/FleetMap';
import { alertSeverityLabel, alertTypeLabel } from '@/lib/alerts/labels';
import type { ActiveAlertView, DeviceDetail } from '@/lib/types';

const STATUS_LABEL: Record<string, string> = {
  online: 'En línea',
  stale: 'Señal débil',
  offline: 'Sin señal',
};

interface GroupedAlert {
  type: string;
  severity: string;
  distanceRemainingKm: number | null;
  activeSince: string;
  occurrences: number;
}

/**
 * El backend vuelve a disparar el mismo tipo de alerta cada ~10min mientras
 * un device se mantiene bajo de combustible (ver ALERT_DEDUPE_MS en
 * shared/fuel.ts), así que activeAlerts puede tener varias filas casi
 * idénticas para una sola condición en curso - se colapsan en una card por
 * tipo en vez de mostrar el mismo mensaje repetido.
 */
function groupActiveAlerts(alerts: ActiveAlertView[]): GroupedAlert[] {
  const byType = new Map<string, ActiveAlertView[]>();
  for (const alert of alerts) {
    const group = byType.get(alert.type);
    if (group) {
      group.push(alert);
    } else {
      byType.set(alert.type, [alert]);
    }
  }

  return [...byType.entries()].map(([type, group]) => {
    const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = sorted[sorted.length - 1];
    return {
      type,
      severity: latest.severity,
      distanceRemainingKm: latest.distanceRemainingKm,
      activeSince: sorted[0].createdAt,
      occurrences: sorted.length,
    };
  });
}

export default function FleetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refresh } = useDeviceDetail(id);
  const { subscribeDevice } = useSocket();
  const [live, setLive] = useState<DeviceDetail | null>(null);
  // Resetea el overlay en vivo al navegar entre vehículos - un ajuste en
  // render (la forma sancionada por React de resetear estado ante un cambio
  // de prop), no un efecto:
  // https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes
  const [liveForId, setLiveForId] = useState(id);
  if (id !== liveForId) {
    setLiveForId(id);
    setLive(null);
  }

  useEffect(() => {
    return subscribeDevice(id, (payload) => {
      setLive((prev) => {
        const base = prev ?? data;
        return base ? (applyPosition(base, payload) as DeviceDetail) : prev;
      });
    });
  }, [id, subscribeDevice, data]);

  const view = live ?? data;

  if (!view) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText themeColor="textTertiary" style={styles.padding}>
          {loading ? 'Cargando…' : 'Sin datos en caché para este vehículo'}
        </ThemedText>
      </ThemedView>
    );
  }

  const reading = view.latestReading;

  return (
    <ScrollView
      style={{ backgroundColor: Palette.bg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={Palette.accent} />}
    >
      {error && (
        <ThemedText type="small" themeColor="statusStale" style={styles.banner}>
          {error} · mostrando datos en caché
        </ThemedText>
      )}

      <View style={styles.header}>
        <StatusDot status={view.connectivityStatus} />
        <ThemedText type="title" style={styles.plate} numberOfLines={1}>
          {view.plate}
        </ThemedText>
      </View>
      <ThemedText type="mono" themeColor="textTertiary">
        {view.publicId} · {STATUS_LABEL[view.connectivityStatus] ?? view.connectivityStatus}
      </ThemedText>

      {reading && (
        <View style={styles.mapBox}>
          <FleetMap devices={[view]} />
        </View>
      )}

      <Card style={styles.card}>
        <ThemedText type="smallBold">Última lectura</ThemedText>
        {reading ? (
          <>
            <ReadingRow label="Combustible" value={`${reading.fuelLevelPct.toFixed(0)}%`} />
            <ReadingRow label="Velocidad" value={`${reading.speedKph.toFixed(0)} km/h`} />
            <ReadingRow label="Temp. motor" value={`${reading.engineTempC.toFixed(0)}°C`} />
            <ReadingRow label="Odómetro" value={`${reading.odometerKm.toFixed(0)} km`} />
            {view.autonomyKm !== null && <ReadingRow label="Autonomía" value={`${view.autonomyKm.toFixed(0)} km`} />}
            <ThemedText type="small" themeColor="textTertiary" style={{ marginTop: Spacing.one }}>
              {new Date(reading.recordedAt).toLocaleString()}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textTertiary">
            Sin lecturas todavía
          </ThemedText>
        )}
      </Card>

      {view.activeAlerts.length > 0 && (
        <Card style={styles.card}>
          <ThemedText type="smallBold">Alertas activas</ThemedText>
          <View style={{ gap: Spacing.two, marginTop: Spacing.one }}>
            {groupActiveAlerts(view.activeAlerts).map((alert) => (
              <View key={alert.type} style={styles.alertRow}>
                <Pill
                  label={alertSeverityLabel(alert.severity)}
                  fg={alert.severity === 'CRITICAL' ? Palette.statusCritical : Palette.statusStale}
                  bg={alert.severity === 'CRITICAL' ? Palette.statusCriticalSoft : Palette.statusStaleSoft}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText type="small">{alertTypeLabel(alert.type)}</ThemedText>
                  <ThemedText type="small" themeColor="textTertiary">
                    {alert.distanceRemainingKm !== null ? `${alert.distanceRemainingKm} km restantes · ` : ''}
                    activa desde {new Date(alert.activeSince).toLocaleTimeString()}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        </Card>
      )}

      {reading && (
        <Card style={styles.card}>
          <DeviceHistoryCharts
            deviceId={view.id}
            tankCapacityL={view.tankCapacityL}
            currentFuelLiters={reading.fuelLiters}
            autonomyKm={view.autonomyKm}
          />
        </Card>
      )}
    </ScrollView>
  );
}

function ReadingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readingRow}>
      <ThemedText type="small" themeColor="textTertiary">
        {label}
      </ThemedText>
      <ThemedText type="mono" themeColor="textPrimary">
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.three, gap: Spacing.three },
  padding: { padding: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plate: { flex: 1 },
  card: { padding: Spacing.three },
  readingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  banner: { padding: Spacing.two },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  mapBox: { height: 220, borderRadius: Radii.md, overflow: 'hidden' },
});
