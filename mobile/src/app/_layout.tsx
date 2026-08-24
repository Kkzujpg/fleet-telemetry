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

// App is dark-only (same "instrument-panel" direction as web, which forces
// color-scheme: dark unconditionally) - no system-scheme branching here.
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

/** Redirects between /login and /(tabs)/* based on session status - the single source of truth for which screens require auth. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    // router.replace() silently no-ops if called before the root navigator's
    // first render commits - wait for a navigation state key, not just a
    // non-loading auth status, or a fast cold-start redirect gets dropped
    // and the app is left stranded on expo-router's Unmatched Route screen.
    if (status === 'loading' || !navigationState?.key) {
      return;
    }
    // Keyed off the login screen, not "inside (tabs)" - the bare root path
    // (no matching route) has segments[0] === undefined, which "inside
    // (tabs)" never catches, leaving an unauthenticated cold start stuck on
    // expo-router's Unmatched Route screen instead of redirecting to login.
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

/** Registers the push token and drains the alert-ack outbox once authenticated; turns live alerts into local notifications. */
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
