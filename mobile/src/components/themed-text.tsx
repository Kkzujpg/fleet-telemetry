import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, Palette, type PaletteColorKey } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'mono';
  themeColor?: PaletteColorKey;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  return (
    <Text
      style={[
        { color: Palette[themeColor ?? 'textPrimary'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'mono' && styles.mono,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  smallBold: {
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  default: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
  },
  link: {
    lineHeight: 22,
    fontSize: 13.5,
  },
  linkPrimary: {
    lineHeight: 22,
    fontSize: 13.5,
    fontWeight: '600',
    color: Palette.accent,
  },
  mono: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
