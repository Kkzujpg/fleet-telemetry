/**
 * Design tokens portados desde web/app/globals.css - mismo look de panel de
 * instrumentos casi negro, un acento índigo, tonos de estado compartiendo la
 * familia del acento. La app web es solo-oscura (`color-scheme: dark` no es
 * condicional ahí), así que mobile también: sin tema claro que mantener
 * sincronizado. Los valores hex son la conversión a sRGB de los tokens
 * oklch() de origen.
 */

import { Platform } from 'react-native';

export const Palette = {
  bg: '#090b10',
  bgElevated: '#0e1016',
  surface1: '#13161c',
  surface2: '#1c1f26',
  surface3: '#262a32',

  borderSubtle: '#ffffff12',
  borderMedium: '#ffffff24',
  borderStrong: '#ffffff38',

  textPrimary: '#f4f5f7',
  textSecondary: '#a6abb5',
  textTertiary: '#7c8089',

  accent: '#8798ff',
  accentStrong: '#a4b5ff',
  accentSoft: '#8798ff29',
  accentRing: '#8798ff73',

  statusOnline: '#2ec97a',
  statusOnlineSoft: '#2ec97a29',
  statusStale: '#ecae30',
  statusStaleSoft: '#ecae3029',
  statusOffline: '#7d8088',
  statusOfflineSoft: '#7d808824',
  statusCritical: '#f45a56',
  statusCriticalSoft: '#f45a5629',

  historySeries2: '#f9875e',
} as const;

export type PaletteColorKey = keyof typeof Palette;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

/** Props de sombra de RN (shadow* de iOS + elevation de Android), ajustadas para el fondo oscuro. */
export const Shadows = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.5, shadowRadius: 2, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 6 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.5, shadowRadius: 28, elevation: 10 },
} as const;

export const Fonts = Platform.select({
  ios: { sans: 'System', mono: 'Menlo' },
  android: { sans: 'sans-serif', mono: 'monospace' },
  default: { sans: 'System', mono: 'monospace' },
})!;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
