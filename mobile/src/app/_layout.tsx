import { useEffect } from 'react';
import { DarkTheme, Stack, ThemeProvider, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider } from '@/lib/auth/session-provider';
import { useSession } from '@/lib/auth/session-context';
import { SocketProvider } from '@/lib/socket/socket-provider';
import { useSocket } from '@/lib/socket/socket-context';
import { registerPushToken, notifyAlert } from '@/lib/push/push';
import { flushAlertAcks } from '@/lib/alerts/flush';
import { Palette } from '@/constants/theme';

// La app es solo-oscura (misma dirección "panel de instrumentos" que web,
// que fuerza color-scheme: dark incondicionalmente) - sin ramificación por
// esquema del sistema acá.
const NAVIGATION_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Palette.bg,
    card: Palette.bgElevated,
    text: Palette.textPrimary,
    border: Palette.borderSubtle,
    primary: Palette.accent,
  },
};

SplashScreen.preventAutoHideAsync();

/** Redirige entre /login y /(tabs)/* según el estado de sesión - la única fuente de verdad sobre qué pantallas requieren auth. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    // router.replace() no hace nada en silencio si se llama antes de que el
    // primer render del navegador raíz haga commit - hay que esperar una key
    // de estado de navegación, no solo un estado de auth ya no-loading, o un
    // redirect de cold-start rápido se pierde y la app queda varada en la
    // pantalla Unmatched Route de expo-router.
    if (status === 'loading' || !navigationState?.key) {
      return;
    }
    // Se basa en la pantalla de login, no en "dentro de (tabs)" - el path
    // raíz desnudo (sin ruta que matchee) tiene segments[0] === undefined,
    // algo que "dentro de (tabs)" nunca captura, dejando un cold start no
    // autenticado atascado en la pantalla Unmatched Route de expo-router en
    // vez de redirigir al login.
    const onLoginScreen = segments[0] === 'login';
    if (status === 'unauthenticated' && !onLoginScreen) {
      router.replace('/login');
    } else if (status === 'authenticated' && (onLoginScreen || !segments[0])) {
      router.replace('/(tabs)/fleet');
    }
  }, [status, segments, router, navigationState?.key]);

  useEffect(() => {
    if (status !== 'loading') {
      SplashScreen.hideAsync();
    }
  }, [status]);

  return <>{children}</>;
}

/** Registra el push token y vacía el outbox de acks de alerta una vez autenticado; convierte alertas en vivo en notificaciones locales. */
function PushAndAlertsBridge() {
  const { status, apiFetch } = useSession();
  const { onAlert } = useSocket();

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    registerPushToken(apiFetch).catch(() => undefined);
    flushAlertAcks(apiFetch).catch(() => undefined);
  }, [status, apiFetch]);

  useEffect(() => onAlert((alert) => void notifyAlert(alert).catch(() => undefined)), [onAlert]);

  return null;
}

export default function RootLayout() {
  return (
    <ThemeProvider value={NAVIGATION_THEME}>
      <StatusBar style="light" />
      <SessionProvider>
        <SocketProvider>
          <AuthGate>
            <PushAndAlertsBridge />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Palette.bg } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </AuthGate>
        </SocketProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
