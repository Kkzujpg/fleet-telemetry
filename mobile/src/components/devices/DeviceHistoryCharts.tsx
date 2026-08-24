import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radii, Spacing } from '@/constants/theme';
import { autonomyThresholdLiters, type HistoryRangeKey, type HistoryChartPoint } from '../../../../shared/device-history';
import { ALERT_THRESHOLD_KM } from '../../../../shared/fuel';
import { useDeviceHistory } from '@/lib/devices/useDeviceHistory';

const RANGE_LABELS: Record<HistoryRangeKey, string> = { '1h': '1 hora', '6h': '6 horas', '24h': '24 horas' };
const RANGE_KEYS: HistoryRangeKey[] = ['1h', '6h', '24h'];
const CHART_HEIGHT = 160;
// Reserved space below the bars for the axis label row - the threshold line's
// "bottom" offset has to clear this too, or it lands under the labels
// instead of level with the bars' own 0-baseline.
const AXIS_LABEL_HEIGHT = 18;

// A View-based bar chart has no "connectNulls: false" gap concept - drop the
// synthetic null midpoints toHistoryChartPoints inserts for recharts' gaps.
function withoutGaps(points: HistoryChartPoint[]) {
  return points.filter((p) => p.fuelLiters !== null);
}

function formatAxisTime(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Labels on every bar would overlap at 1m/5m bucket density - thin them out
// the way an auto axis would, keeping only ~5 evenly spaced ticks.
function thinLabels(points: HistoryChartPoint[], keep = 5): string[] {
  const step = Math.max(1, Math.ceil(points.length / keep));
  return points.map((p, i) => (i % step === 0 || i === points.length - 1 ? formatAxisTime(p.t) : ''));
}

export interface DeviceHistoryChartsProps {
  deviceId: string;
  tankCapacityL: number;
  currentFuelLiters: number;
  autonomyKm: number | null;
}

export function DeviceHistoryCharts({ deviceId, tankCapacityL, currentFuelLiters, autonomyKm }: DeviceHistoryChartsProps) {
  const [range, setRange] = useState<HistoryRangeKey>('1h');
  const { status, points: rawPoints, error, retry } = useDeviceHistory(deviceId, range, tankCapacityL);
  const points = useMemo(() => withoutGaps(rawPoints), [rawPoints]);
  const thresholdLiters = useMemo(
    () => autonomyThresholdLiters(currentFuelLiters, autonomyKm, ALERT_THRESHOLD_KM),
    [currentFuelLiters, autonomyKm],
  );
  const labels = useMemo(() => thinLabels(points), [points]);

  const fuelMax = Math.max(1, ...points.map((p) => p.fuelLiters ?? 0), thresholdLiters ?? 0) * 1.1;
  const speedMax = Math.max(1, ...points.map((p) => p.avgSpeedKph ?? 0), ...points.map((p) => p.maxSpeedKph ?? 0)) * 1.15;
  const barWidth = points.length > 40 ? 6 : points.length > 15 ? 12 : 22;

  return (
    <View>
      <View style={styles.rangeRow}>
        {RANGE_KEYS.map((key) => {
          const active = range === key;
          return (
            <Pressable key={key} onPress={() => setRange(key)} style={[styles.rangeButton, active && styles.rangeButtonActive]}>
              <Text style={[styles.rangeLabel, active && styles.rangeLabelActive]}>{RANGE_LABELS[key]}</Text>
            </Pressable>
          );
        })}
      </View>

      {status === 'loading' && (
        <ThemedText themeColor="textTertiary" style={styles.message}>
          Cargando historial…
        </ThemedText>
      )}

      {status === 'error' && (
        <View style={styles.message}>
          <ThemedText themeColor="statusStale">{error}</ThemedText>
          <Pressable onPress={retry}>
            <ThemedText type="linkPrimary">Reintentar</ThemedText>
          </Pressable>
        </View>
      )}

      {status === 'empty' && (
        <ThemedText themeColor="textTertiary" style={styles.message}>
          Este vehículo no tiene lecturas en este rango.
        </ThemedText>
      )}

      {status === 'success' && (
        <View style={{ gap: Spacing.four }}>
          <View>
            <ThemedText type="small" style={styles.chartTitle}>
              Combustible (L)
            </ThemedText>
            <View style={styles.chartBox}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.barsArea}>
                  {thresholdLiters !== null && thresholdLiters <= fuelMax && (
                    <View
                      style={[
                        styles.thresholdLine,
                        { bottom: AXIS_LABEL_HEIGHT + (thresholdLiters / fuelMax) * CHART_HEIGHT },
                      ]}
                    />
                  )}
                  {points.map((p, i) => (
                    <View key={p.t} style={[styles.barColumn, { width: barWidth }]}>
                      <View
                        style={[
                          styles.bar,
                          { height: Math.max(1, ((p.fuelLiters ?? 0) / fuelMax) * CHART_HEIGHT), backgroundColor: Palette.accent },
                        ]}
                      />
                      <Text style={styles.axisLabel} numberOfLines={1}>
                        {labels[i]}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
            {thresholdLiters !== null && (
              <ThemedText type="small" themeColor="statusStale" style={styles.thresholdCaption}>
                ┄ Umbral {ALERT_THRESHOLD_KM}km de autonomía ({thresholdLiters.toFixed(1)} L)
              </ThemedText>
            )}
          </View>

          <View>
            <ThemedText type="small" style={styles.chartTitle}>
              Velocidad (km/h)
            </ThemedText>
            <View style={styles.legendRow}>
              <LegendItem color={Palette.accent} label="Promedio" />
              <LegendItem color={Palette.historySeries2} label="Máximo" />
            </View>
            <View style={styles.chartBox}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.barsArea}>
                  {points.map((p, i) => (
                    <View key={p.t} style={[styles.barColumn, { width: barWidth }]}>
                      <View style={{ height: CHART_HEIGHT, width: '100%', justifyContent: 'flex-end' }}>
                        <View
                          style={[
                            styles.maxMarker,
                            { bottom: ((p.maxSpeedKph ?? 0) / speedMax) * CHART_HEIGHT },
                          ]}
                        />
                        <View
                          style={[
                            styles.bar,
                            {
                              height: Math.max(1, ((p.avgSpeedKph ?? 0) / speedMax) * CHART_HEIGHT),
                              backgroundColor: Palette.accent,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.axisLabel} numberOfLines={1}>
                        {labels[i]}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rangeRow: { flexDirection: 'row', gap: 6, marginBottom: Spacing.three },
  rangeButton: {
    borderWidth: 1,
    borderColor: Palette.borderMedium,
    borderRadius: Radii.pill,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  rangeButtonActive: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  rangeLabel: { fontSize: 12.5, fontWeight: '500', color: Palette.textSecondary },
  rangeLabelActive: { color: Palette.bg },
  message: { paddingVertical: Spacing.three, gap: Spacing.two },
  chartTitle: { color: Palette.textPrimary, marginBottom: 6 },
  chartBox: {
    backgroundColor: Palette.surface1,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  barsArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT + AXIS_LABEL_HEIGHT,
  },
  barColumn: { alignItems: 'center', marginRight: 3 },
  bar: { width: '70%', borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  maxMarker: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: Palette.historySeries2 },
  thresholdLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: Palette.statusStale,
  },
  thresholdCaption: { marginTop: 6 },
  axisLabel: { fontSize: 9.5, color: Palette.textTertiary, marginTop: 4 },
  legendRow: { flexDirection: 'row', gap: 14, marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { fontSize: 11.5, color: Palette.textTertiary },
});
