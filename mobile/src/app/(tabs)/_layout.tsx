import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/auth/session-context';
import { OfflineBadge } from '@/components/ui/OfflineBadge';
import { Palette } from '@/constants/theme';

export default function TabsLayout() {
  const { user } = useSession();

  return (
    <Tabs
      screenOptions={{
        headerRight: () => <OfflineBadge />,
        headerStyle: { backgroundColor: Palette.bgElevated },
        headerTitleStyle: { color: Palette.textPrimary, fontWeight: '700' },
        headerTintColor: Palette.textPrimary,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: Palette.bgElevated, borderTopColor: Palette.borderSubtle },
        tabBarActiveTintColor: Palette.accent,
        tabBarInactiveTintColor: Palette.textTertiary,
      }}
    >
      <Tabs.Screen
        name="fleet"
        options={{
          title: 'Flota',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alertas',
          // Oculta la tab para roles no-ADMIN; alerts/index.tsx también
          // redirige si se llega a esta ruta directamente, ya que ocultar
          // una tab es solo UI.
          href: user?.role === 'ADMIN' ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
