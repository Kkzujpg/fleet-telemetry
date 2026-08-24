import { StyleSheet, Text, View } from 'react-native';

import { Radii } from '@/constants/theme';

export interface PillProps {
  label: string;
  fg: string;
  bg: string;
}

/** Chip redondeado de estado/alerta - misma forma que los pills de alerta y los badges de severidad de web. */
export function Pill({ label, fg, bg }: PillProps) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radii.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
