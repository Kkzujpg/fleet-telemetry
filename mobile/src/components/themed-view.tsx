import { View, type ViewProps } from 'react-native';

import { Palette, type PaletteColorKey } from '@/constants/theme';

export type ThemedViewProps = ViewProps & {
  type?: PaletteColorKey;
};

export function ThemedView({ style, type, ...otherProps }: ThemedViewProps) {
  return <View style={[{ backgroundColor: Palette[type ?? 'bg'] }, style]} {...otherProps} />;
}
