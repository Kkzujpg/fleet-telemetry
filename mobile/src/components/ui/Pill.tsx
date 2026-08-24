import { StyleSheet, Text, View } from 'react-native';

import { Radii } from '@/constants/theme';

export interface PillProps {
  label: string;
  fg: string;
  bg: string;
}

/** Rounded status/alert chip - same shape as web's alert pills and the severity badges. */
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
