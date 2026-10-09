import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { BRAND, COLORS } from '../constants';

const fmt = (d: Date) =>
  d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// The installed version and the over-the-air update it is running, so drivers can see
// when the latest changes have arrived — plus a button to fetch them straight away.
export default function AppVersion() {
  const [checking, setChecking] = useState(false);
  const version = Application.nativeApplicationVersion || '—';
  const build = Application.nativeBuildVersion;
  const fromUpdate = Updates.isEnabled && !Updates.isEmbeddedLaunch;
  const updateLine = !Updates.isEnabled
    ? 'Development build'
    : fromUpdate && Updates.createdAt
      ? `Updated ${fmt(Updates.createdAt)}${Updates.updateId ? ` · ${Updates.updateId.slice(0, 8)}` : ''}`
      : 'Original release';
  const channel = Updates.channel && Updates.channel !== 'production' ? ` · ${Updates.channel}` : '';

  const check = async () => {
    if (!Updates.isEnabled) {
      Alert.alert('Updates', "Updates aren't available in this build.");
      return;
    }
    setChecking(true);
    try {
      const res = await Updates.checkForUpdateAsync();
      if (!res.isAvailable) {
        Alert.alert('Up to date', `You have the latest version (${version}).`);
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert('Update downloaded', 'Restart the app to start using it.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart now', onPress: () => { Updates.reloadAsync().catch(() => {}); } },
      ]);
    } catch {
      Alert.alert("Couldn't check for updates", 'Check your internet connection and try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={{ marginTop: 20, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="information-circle-outline" size={24} color={COLORS.navy} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>
            {BRAND.driverName} {version}{build ? ` (build ${build})` : ''}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{updateLine}{channel}</Text>
        </View>
      </View>
      <Pressable
        onPress={check}
        disabled={checking}
        style={{ marginTop: 12, borderRadius: 22, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border }}
      >
        {checking ? <ActivityIndicator size="small" color={COLORS.navy} /> : <Ionicons name="refresh" size={16} color={COLORS.navy} />}
        <Text style={{ color: COLORS.navy, fontWeight: '700' }}>{checking ? 'Checking…' : 'Check for updates'}</Text>
      </Pressable>
    </View>
  );
}
