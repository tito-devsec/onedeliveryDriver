import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, post, get, setAuthFailureHandler } from '../lib/api';
import {
  saveTokens,
  clearTokens,
  getAccessToken,
  saveUser,
} from '../lib/storage';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type {
  User,
  AuthResponse,
  DriverApplication,
  DriverProfile,
} from '../types';

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
}

interface AuthContextType {
  user: User | null;
  application: DriverApplication | null;
  profile: DriverProfile | null;
  loading: boolean;
  isApproved: boolean;
  appState: 'none' | 'pending' | 'approved' | 'rejected';
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  applyAsDriver: (form: FormData) => Promise<void>;
  refreshStatus: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [application, setApplication] = useState<DriverApplication | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDriverState = useCallback(async () => {
    // Application status (works for any logged-in user)
    try {
      const appRes = await get<{ application: DriverApplication | null }>(
        '/driver/application'
      );
      setApplication(appRes.application);
    } catch {
      setApplication(null);
    }
    // Profile exists only once approved
    try {
      const profRes = await get<{ profile: DriverProfile }>('/driver/profile');
      setProfile(profRes.profile);
    } catch {
      setProfile(null);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setUser(null);
        return;
      }
      const me = await get<{ user: User }>('/auth/me');
      setUser(me.user);
      await saveUser(me.user);
      await loadDriverState();
      await connectSocket();
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [loadDriverState]);

  useEffect(() => {
    setAuthFailureHandler(() => {
      setUser(null);
      setApplication(null);
      setProfile(null);
      disconnectSocket();
    });
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await post<AuthResponse>('/auth/login', { email, password });
      await saveTokens(data.accessToken, data.refreshToken);
      await saveUser(data.user);
      setUser(data.user);
      await loadDriverState();
      await connectSocket();
    },
    [loadDriverState]
  );

  const register = useCallback(async (payload: RegisterPayload) => {
    const data = await post<AuthResponse>('/auth/register', payload);
    await saveTokens(data.accessToken, data.refreshToken);
    await saveUser(data.user);
    setUser(data.user);
  }, []);

  const applyAsDriver = useCallback(
    async (form: FormData) => {
      await api.post('/driver/apply', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      await loadDriverState();
    },
    [loadDriverState]
  );

  const refreshStatus = useCallback(async () => {
    try {
      const me = await get<{ user: User }>('/auth/me');
      setUser(me.user);
      await saveUser(me.user);
      await loadDriverState();
      if (me.user.role === 'driver') await connectSocket();
    } catch {
      /* ignore transient errors */
    }
  }, [loadDriverState]);

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout', {});
    } catch {
      /* ignore */
    }
    await clearTokens();
    disconnectSocket();
    setUser(null);
    setApplication(null);
    setProfile(null);
  }, []);

  const isApproved =
    (!!profile && profile.is_approved === 1) ||
    application?.status === 'approved';

  const appState: AuthContextType['appState'] = isApproved
    ? 'approved'
    : application?.status === 'rejected'
      ? 'rejected'
      : application?.status === 'pending'
        ? 'pending'
        : 'none';

  return (
    <AuthContext.Provider
      value={{
        user,
        application,
        profile,
        loading,
        isApproved,
        appState,
        login,
        register,
        applyAsDriver,
        refreshStatus,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
