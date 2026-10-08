import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
} from './storage';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4000/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client': 'OneDelivery-Driver/1.0',
  },
});

// Callback invoked when refresh ultimately fails → force logout in AuthContext
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn;
}

// ── Attach access token ───────────────────────────────────────────────────────
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Handle 401 → refresh once, then retry ────────────────────────────────────
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

function flushQueue(token: string | null) {
  pendingQueue.forEach((cb) => cb(token));
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (!error.response) {
      return Promise.reject(new Error('Network error. Check your connection.'));
    }
    if (error.response.status === 429) {
      return Promise.reject(new Error('Too many requests. Please wait a moment.'));
    }

    // Try a single refresh on 401
    if (error.response.status === 401 && original && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push((token) => {
            if (!token) return reject(error);
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });
        await saveTokens(data.accessToken, data.refreshToken);
        flushQueue(data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        flushQueue(null);
        await clearTokens();
        onAuthFailure?.();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    // Normalise error message
    const msg =
      (error.response.data as { error?: string })?.error ||
      'Something went wrong. Please try again.';
    return Promise.reject(new Error(msg));
  }
);

// ── Typed helpers ─────────────────────────────────────────────────────────────
export async function get<T>(url: string, params?: object): Promise<T> {
  const { data } = await api.get<T>(url, { params });
  return data;
}
export async function post<T>(url: string, body?: object): Promise<T> {
  const { data } = await api.post<T>(url, body);
  return data;
}
export async function put<T>(url: string, body?: object): Promise<T> {
  const { data } = await api.put<T>(url, body);
  return data;
}
export async function del<T>(url: string): Promise<T> {
  const { data } = await api.delete<T>(url);
  return data;
}
