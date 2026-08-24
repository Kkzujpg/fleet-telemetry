import { Stack } from 'expo-router';
import { OfflineBadge } from '@/components/ui/OfflineBadge';
import { Palette } from '@/constants/theme';

export default function FleetLayout() {
  return (
    <Stack
      screenOptions={{
        headerRight: () => <OfflineBadge />,
        headerStyle: { backgroundColor: Palette.bgElevated },
        headerTitleStyle: { color: Palette.textPrimary, fontWeight: '700' },
        headerTintColor: Palette.textPrimary,
        headerShadowVisible: false,
      }}
    >
      {/* The map draws its own floating controls (menu button, offline badge)
          over the full-bleed map - the native header would just duplicate them. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="list" options={{ title: 'Vehículos' }} />
      <Stack.Screen name="[id]" options={{ title: 'Detalle' }} />
    </Stack>
  );
}
