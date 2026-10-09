import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as VehicleImage } from 'expo-image';
import { COLORS, BRAND, VEHICLE_TYPES } from '../../constants';
import { vehicleSideImage } from '../../lib/vehicles';
import { useAuth } from '../../context/AuthContext';
import { LEGAL_URLS, openLegal } from '../../lib/legal';
import AppVersion from '../../components/AppVersion';

export default function Profile() {
  const { user, profile, application, appState, logout } = useAuth();
  const vehicle = VEHICLE_TYPES.find((v) => v.id === (profile?.vehicle_type || application?.vehicle_type));

  const confirmLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const statusPill =
    appState === 'approved'
      ? { text: 'Approved', color: COLORS.success, bg: COLORS.successBg }
      : appState === 'pending'
        ? { text: 'In review', color: COLORS.warning, bg: COLORS.warningBg }
        : appState === 'rejected'
          ? { text: 'Rejected', color: COLORS.danger, bg: COLORS.dangerBg }
          : { text: 'Incomplete', color: COLORS.textMuted, bg: COLORS.surface };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ width: 86, height: 86, borderRadius: 43, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' }}>
            {user?.profile_image ? (
              <Image source={{ uri: user.profile_image }} style={{ width: 86, height: 86, borderRadius: 43 }} />
            ) : (
              <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800' }}>
                {(user?.name || 'D').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginTop: 12 }}>{user?.name}</Text>
          <Text style={{ color: COLORS.textMuted }}>{user?.phone || user?.email}</Text>
          <View style={{ marginTop: 10, backgroundColor: statusPill.bg, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 }}>
            <Text style={{ color: statusPill.color, fontWeight: '700', fontSize: 13 }}>{statusPill.text}</Text>
          </View>
        </View>

        {/* Stats */}
        {appState === 'approved' && (
          <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border }}>
            <Stat label="Rating" value={`${Number(profile?.rating || 0).toFixed(1)}★`} />
            <Divider />
            <Stat label="Trips" value={String(profile?.total_trips ?? 0)} />
            <Divider />
            <Stat label="Balance" value={`${Number(profile?.balance || 0).toLocaleString()}`} />
          </View>
        )}

        {/* Vehicle */}
        <Section title="Vehicle">
          {!!vehicle && (
            <VehicleImage source={vehicleSideImage(vehicle.id)} style={{ width: 120, height: 80, alignSelf: 'center', marginVertical: 6 }} contentFit="contain" />
          )}
          <Row icon="car" label="Type" value={vehicle?.label || '-'} />
          <Row icon="pricetag" label="Plate" value={(profile?.plate_number || application?.plate_number || '-').toUpperCase()} />
          <Row icon="color-palette" label="Colour" value={profile?.vehicle_color || application?.vehicle_color || '-'} />
          <Row icon="construct" label="Model" value={profile?.vehicle_model || application?.vehicle_model || '-'} last />
        </Section>

        {/* Payout */}
        <Section title="Payout">
          <Row icon="phone-portrait" label="Mobile money" value={profile?.mobile_money_number || 'Set in app'} />
          <Row icon="card" label="Bank account" value={profile?.bank_account_number || 'Not set'} last />
        </Section>

        {/* Account */}
        <Section title="Account">
          <Row icon="mail" label="Email" value={user?.email || '-'} />
          <Row icon="shield-checkmark" label="License #" value={profile?.license_number || application?.license_number || '-'} last />
        </Section>

        {/* Legal */}
        <Section title="Legal">
          <LinkRow icon="document-text-outline" label="Privacy policy" onPress={() => openLegal(LEGAL_URLS.privacy)} />
          <LinkRow icon="reader-outline" label="Terms of service" onPress={() => openLegal(LEGAL_URLS.terms)} />
          <LinkRow icon="trash-outline" label="Delete my account" onPress={() => openLegal(LEGAL_URLS.deleteAccount)} danger last />
        </Section>

        <Pressable
          onPress={confirmLogout}
          style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 28, borderWidth: 1.5, borderColor: COLORS.dangerBg, backgroundColor: COLORS.dangerBg }}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={{ color: COLORS.danger, fontWeight: '700' }}>Sign out</Text>
        </Pressable>

        {/* App version + over-the-air update */}
        <AppVersion />

        <Text style={{ textAlign: 'center', color: COLORS.textDim, marginTop: 16, fontSize: 12 }}>
          {BRAND.slogan}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontWeight: '700', color: COLORS.textMuted, fontSize: 13, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase' }}>
        {title}
      </Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.border }}>
        {children}
      </View>
    </View>
  );
}

function Row({ icon, label, value, last }: { icon: any; label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: COLORS.border }}>
      <Ionicons name={icon} size={20} color={COLORS.primary} />
      <Text style={{ marginLeft: 12, color: COLORS.textMuted, flex: 1 }}>{label}</Text>
      <Text style={{ color: COLORS.textPrimary, fontWeight: '600', maxWidth: '55%', textAlign: 'right' }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function LinkRow({ icon, label, onPress, danger, last }: { icon: any; label: string; onPress: () => void; danger?: boolean; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: COLORS.border }}>
      <Ionicons name={icon} size={20} color={danger ? COLORS.danger : COLORS.primary} />
      <Text style={{ marginLeft: 12, flex: 1, fontWeight: '600', color: danger ? COLORS.danger : COLORS.textPrimary }}>{label}</Text>
      <Ionicons name="open-outline" size={16} color={COLORS.textDim} />
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontWeight: '800', fontSize: 17, color: COLORS.textPrimary }}>{value}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={{ width: 1, backgroundColor: COLORS.border }} />;
}
