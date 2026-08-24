import { StyleSheet, View, type ViewProps } from 'react-native';

import { Palette, Radii, Shadows } from '@/constants/theme';

export type CardProps = ViewProps & {
  /** Estado seleccionado/presionado - borde de acento + relleno de acento suave, refleja el device-card[data-selected] de web. */
  selected?: boolean;
  elevated?: boolean;
};

/** Superficie tipo glass-card: borde sutil, radio, sombra real - la unidad base del lenguaje visual de web. */
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
