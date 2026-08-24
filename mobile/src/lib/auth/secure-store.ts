import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'fleet_refresh_token';

export async function getStoredRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredRefreshToken(token: string | null): Promise<void> {
  try {
    if (token) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    }
  } catch {
    // Keychain/Keystore unavailable - session just won't survive an app restart.
  }
}
