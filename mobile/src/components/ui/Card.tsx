import { StyleSheet, View, type ViewProps } from 'react-native';

import { Palette, Radii, Shadows } from '@/constants/theme';

export type CardProps = ViewProps & {
  /** Selected/pressed state - accent border + soft accent fill, mirrors web's device-card[data-selected]. */
  selected?: boolean;
  elevated?: boolean;
};

/** Glass-card surface: subtle border, radius, real shadow - the base unit of web's visual language. */
export function Card({ style, selected, elevated, ...rest }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        elevated && Shadows.md,
        selected && styles.selected,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Palette.surface1,
    borderWidth: 1,
    borderColor: Palette.borderSubtle,
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  selected: {
    backgroundColor: Palette.accentSoft,
    borderColor: Palette.accentRing,
  },
});
