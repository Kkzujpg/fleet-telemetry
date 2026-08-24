import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/Card';
import { Palette, Radii, Shadows, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/session-context';

type Field = 'email' | 'password' | null;

export default function LoginScreen() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState<Field>(null);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'no se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.brand}>
          <View style={styles.brandBadge}>
            <Ionicons name="car-sport" size={28} color={Palette.accent} />
          </View>
          <ThemedText type="subtitle" style={styles.brandTitle}>
            Fleet Telemetry
          </ThemedText>
          <ThemedText type="small" themeColor="textTertiary">
            Iniciá sesión para continuar
          </ThemedText>
        </View>

        <Card style={styles.card} elevated>
          <TextInput
            style={[styles.input, focused === 'email' && styles.inputFocused]}
            placeholder="correo"
            placeholderTextColor={Palette.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
          />
          <TextInput
            style={[styles.input, focused === 'password' && styles.inputFocused]}
            placeholder="contraseña"
            placeholderTextColor={Palette.textTertiary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
            onSubmitEditing={handleSubmit}
          />

          {error && (
            <ThemedText type="small" themeColor="statusCritical">
              {error}
            </ThemedText>
          )}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              { opacity: canSubmit ? 1 : 0.5 },
              pressed && canSubmit && styles.buttonPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={Palette.bg} />
            ) : (
              <ThemedText themeColor="bg" style={styles.buttonText}>
                Ingresar
              </ThemedText>
            )}
          </Pressable>
        </Card>
      </SafeAreaView>
    </ThemedView>
  );
}

const BADGE_SIZE = 56;

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.four },
  brand: { alignItems: 'center', gap: Spacing.one },
  brandBadge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: Palette.surface2,
    borderWidth: 1,
    borderColor: Palette.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
    ...Shadows.md,
  },
  brandTitle: { textAlign: 'center' },
  card: { padding: Spacing.three, gap: Spacing.two },
  input: {
    borderWidth: 1,
    borderColor: Palette.borderMedium,
    backgroundColor: Palette.surface1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
    color: Palette.textPrimary,
  },
  inputFocused: { borderColor: Palette.accent },
  button: {
    backgroundColor: Palette.accent,
    borderRadius: Radii.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  buttonPressed: { backgroundColor: Palette.accentStrong },
  buttonText: { fontWeight: '600' },
});
