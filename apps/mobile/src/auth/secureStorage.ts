import * as SecureStore from "expo-secure-store";
import type { TokenStorage } from "./session";

const KEY = "budgetsplit.refresh-token";

/**
 * Keeps the refresh token in the iOS Keychain / Android Keystore (expo-secure-store), not in plain
 * AsyncStorage, so other apps and device backups can't read it (threat model: session hijacking).
 */
export const secureTokenStorage: TokenStorage = {
  get: () => SecureStore.getItemAsync(KEY).catch(() => null),
  set: (refreshToken) => SecureStore.setItemAsync(KEY, refreshToken),
  clear: () => SecureStore.deleteItemAsync(KEY).catch(() => undefined),
};
