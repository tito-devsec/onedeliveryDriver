import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import LoadingScreen from '../components/LoadingScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 20000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

function RootNav() {
  const { user, appState, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  usePushNotifications(!!user);

  useEffect(() => {
    if (loading) return;
    const root = segments[0];
    const inAuth = root === '(auth)';
    const inRegister = root === 'register';

    if (!user) {
      // Allow the welcome screen AND the register flow (step 0 creates the account).
      if (!inAuth && !inRegister) router.replace('/(auth)/welcome');
      return;
    }
    // Logged in but no driver application yet → finish registration
    if (appState === 'none') {
      if (!inRegister) router.replace('/register');
      return;
    }
    // Has an application (pending/approved/rejected) → main app
    if (inAuth || inRegister) {
      router.replace('/(tabs)/home');
    }
  }, [user, appState, loading, segments, router]);

  if (loading) return <LoadingScreen />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }}>
      <Stack.Screen name="(auth)/welcome" />
      <Stack.Screen name="(auth)/login" />
      <Stack.Screen name="register/index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="delivery/[id]" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="chat/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <RootNav />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
