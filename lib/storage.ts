import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'od_access_token';
const REFRESH_KEY = 'od_refresh_token';
const USER_KEY = 'od_user';

export async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function saveUser(user: unknown) {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getStoredUser<T = unknown>(): Promise<T | null> {
  const v = await SecureStore.getItemAsync(USER_KEY);
  return v ? (JSON.parse(v) as T) : null;
}
