import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Palette } from '@/constants/theme';
import type { DeviceConnectivityStatus } from '../../../../shared/device-status';

const STATUS_COLOR: Record<DeviceConnectivityStatus, string> = {
  online: Palette.statusOnline,
  stale: Palette.statusStale,
  offline: Palette.statusOffline,
};

/** Indicador de estado pequeño; pulsa para "online" igual que los keyframes dot-pulse de web. */
export function StatusDot({ status }: { status: DeviceConnectivityStatus }) {
  // useState perezoso en vez de useRef - mantiene un Animated.Value estable
  // sin leer un ref durante el render (el React Compiler marca eso como inseguro).
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (status !== 'online') {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  const color = STATUS_COLOR[status];
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.08, 0] });

  return (
    <View style={styles.wrap}>
      {status === 'online' && (
        <Animated.View
          style={[styles.ring, { backgroundColor: color, transform: [{ scale: ringScale }], opacity: ringOpacity }]}
        />
      )}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const SIZE = 8;

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  dot: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
});
