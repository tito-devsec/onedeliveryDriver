import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, ViewStyle } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { GOOGLE_WEB_CLIENT_ID, getGoogleIdToken } from '../lib/googleAuth';
import { COLORS } from '../constants';

// "Continue with Google" — signs in, or creates the account on first use (new
// accounts then go on to the driver application). Hidden until the Firebase
// Google client ID is part of the build.
export default function GoogleButton({ style }: { style?: ViewStyle }) {
  const { loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!GOOGLE_WEB_CLIENT_ID) return null;

  const onPress = async () => {
    setBusy(true);
    try {
      const idToken = await getGoogleIdToken();
      if (idToken) await loginWithGoogle(idToken); // routing handled by the guard
    } catch (e: any) {
      Alert.alert('Google sign-in failed', e?.response?.data?.error || e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        {
          backgroundColor: COLORS.white,
          borderRadius: 30,
          paddingVertical: 15,
          paddingHorizontal: 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          borderWidth: 1.5,
          borderColor: COLORS.border,
          opacity: busy ? 0.6 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={COLORS.navy} />
      ) : (
        <>
          <Image source={require('../assets/google-g.png')} style={{ width: 20, height: 20 }} />
          <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' }}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}
