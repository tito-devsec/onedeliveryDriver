import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button, Field, BrandLogo } from '../../components/ui';
import { COLORS } from '../../constants';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await login(email.trim().toLowerCase(), password);
      // routing handled by guard
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={{ marginBottom: 12 }}>
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </Pressable>

          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <BrandLogo size={42} showSlogan />
          </View>

          <Text style={{ fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 }}>
            Welcome back
          </Text>
          <Text style={{ color: COLORS.textMuted, marginBottom: 28 }}>Sign in to your driver account</Text>

          <Field
            label="Email address"
            required
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <View>
            <Field
              label="Password"
              required
              placeholder="Your password"
              secureTextEntry={!showPw}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable onPress={() => setShowPw((s) => !s)} style={{ position: 'absolute', right: 16, top: 42 }}>
              <Ionicons name={showPw ? 'eye-off' : 'eye'} size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {!!error && (
            <View style={{ backgroundColor: COLORS.dangerBg, padding: 12, borderRadius: 10, marginBottom: 16 }}>
              <Text style={{ color: COLORS.danger, fontSize: 13 }}>{error}</Text>
            </View>
          )}

          <Button title="Sign in" onPress={submit} loading={loading} style={{ marginTop: 8 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
            <Text style={{ color: COLORS.textMuted }}>New driver? </Text>
            <Pressable onPress={() => router.replace('/register')}>
              <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Register here</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
