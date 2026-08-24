import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Palette, Radii, Spacing } from '@/constants/theme';
import { useAlerts } from '@/lib/alerts/useAlerts';
import { useAlertAck } from '@/lib/alerts/useAlertAck';
import { alertTypeLabel } from '@/lib/alerts/labels';
import type { DeviceListItem } from '@/lib/types';

function severityTokens(severity: string) {
  return severity === 'CRITICAL'
    ? { fg: Palette.statusCritical, bg: Palette.statusCriticalSoft }
    : { fg: Palette.statusStale, bg: Palette.statusStaleSoft };
}

/** Strip anclado de alertas activas sobre la lista de flota - refleja el AlertsPanel de web. Solo ADMIN, igual que web. */
export function AlertsStrip({ devices }: { devices: DeviceListItem[] }) {
  const { data, refresh } = useAlerts();
  const { pendingIds, handleAck } = useAlertAck(refresh);
  const plateByDeviceId = new Map(devices.map((d) => [d.id, d.plate]));
  // El backend devuelve createdAt ascendente - se invierte para
  // más-reciente-primero, igual que la pantalla completa de alertas.
  const active = (data?.items ?? [])
    .filter((a) => !a.acknowledgedAt)
    .reverse();

  if (active.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {active.map((alert) => {
          const tokens = severityTokens(alert.severity);
          return (
            <View key={alert.id} style={[styles.pill, { backgroundColor: tokens.bg }]}>
              <Text style={[styles.plate, { color: tokens.fg }]}>{plateByDeviceId.get(alert.deviceId) ?? '—'}</Text>
              <Text style={[styles.type, { color: tokens.fg }]}>{alertTypeLabel(alert.type)}</Text>
              <Pressable
                onPress={() => handleAck(alert.id)}
                disabled={pendingIds.has(alert.id)}
                style={[styles.ackButton, { opacity: pendingIds.has(alert.id) ? 0.5 : 1 }]}
              >
                <Text style={[styles.ackLabel, { color: tokens.fg }]}>✓</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Palette.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: Palette.borderSubtle,
    paddingVertical: Spacing.two,
  },
  row: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: Radii.pill,
  },
  plate: { fontSize: 12.5, fontWeight: '700' },
  type: { fontSize: 12.5, opacity: 0.9 },
  ackButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff24',
  },
  ackLabel: { fontSize: 11, fontWeight: '700' },
});
