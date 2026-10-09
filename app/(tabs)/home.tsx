import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, BRAND, LIGHT_MAP_STYLE, DEFAULT_REGION } from '../../constants';
import { useAuth } from '../../context/AuthContext';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import { useRideRequests } from '../../hooks/useRideRequests';
import { useCurrentRide } from '../../hooks/useEarnings';
import { put } from '../../lib/api';
import { emitDriverOnline, emitDriverOffline, connectSocket } from '../../lib/socket';
import { isTracking, startTracking, stopTracking, refreshFix, getLastFix } from '../../lib/tracking';
import RideRequestModal from '../../components/RideRequestModal';
import type { RideOffer } from '../../types';

export default function Home() {
  const router = useRouter();
  const { profile, appState, application, refreshStatus } = useAuth();
  const approved = appState === 'approved';

  const [online, setOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const mapRef = useRef<MapView>(null);
  const centeredRef = useRef(false);

  const { location, getCurrent } = useDriverLocation();
  const { data: currentRideData } = useCurrentRide(approved);
  const currentRide = currentRideData?.ride;
  const { incoming, accept, decline, dismiss, open, available } = useRideRequests({
    online: online && approved,
    busy: !!currentRide,
  });

  // Poll application status while pending so screen flips to GO LIVE on approval
  useFocusEffect(
    useCallback(() => {
      refreshStatus();
      if (appState === 'pending') {
        const t = setInterval(refreshStatus, 12000);
        return () => clearInterval(t);
      }
    }, [appState, refreshStatus])
  );

  // Still online from before (the location service keeps running): pick up where we were
  useEffect(() => {
    isTracking().then(async (running) => {
      if (!running) return;
      setOnline(true);
      await connectSocket();
      const f = getLastFix();
      emitDriverOnline(f?.latitude, f?.longitude, f?.heading);
    });
  }, []);

  // Reconnect socket when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') connectSocket();
    });
    return () => sub.remove();
  }, []);

  // Centre the map on the driver once a position is known
  useEffect(() => {
    if (location && !centeredRef.current && mapRef.current) {
      centeredRef.current = true;
      mapRef.current.animateToRegion({ ...location, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 600);
    }
  }, [location?.latitude, location?.longitude]);

  // If there is an active delivery, open it — once (accepting also opens it)
  const openedRef = useRef<string | null>(null);
  const openDelivery = (rideId: string) => {
    openedRef.current = rideId;
    router.push(`/delivery/${rideId}`);
  };
  useEffect(() => {
    if (!currentRide) {
      openedRef.current = null;
    } else if (openedRef.current !== currentRide.id) {
      openDelivery(currentRide.id);
    }
  }, [currentRide?.id]);

  const goLive = async () => {
    if (toggling) return;
    setToggling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      if (!online) {
        // The location service must start while the app is on screen
        await startTracking();
        const f = await refreshFix(true);
        await put('/rides/driver/online', { isOnline: true, lat: f?.latitude, lng: f?.longitude, heading: f?.heading });
        await connectSocket();
        emitDriverOnline(f?.latitude, f?.longitude, f?.heading);
        setOnline(true);
      } else {
        if (currentRide) {
          Alert.alert('Delivery in progress', 'Finish or release your current delivery before going offline.');
          return;
        }
        await put('/rides/driver/online', { isOnline: false });
        emitDriverOffline();
        await stopTracking();
        setOnline(false);
      }
    } catch (e: any) {
      Alert.alert('Location needed', e?.message || 'Could not change your status. Please try again.');
    } finally {
      setToggling(false);
    }
  };

  const onAccept = async (rideId: string) => {
    try {
      await accept(rideId);
      openDelivery(rideId);
    } catch (e: any) {
      Alert.alert('Not available', e?.message || 'This delivery is no longer available.');
      throw e;
    }
  };

  const locate = async () => {
    const here = await getCurrent();
    if (here) mapRef.current?.animateToRegion({ ...here, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
  };

  const offers = online && approved && !currentRide ? available : [];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        customMapStyle={LIGHT_MAP_STYLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        initialRegion={location ? { ...location, latitudeDelta: 0.03, longitudeDelta: 0.03 } : DEFAULT_REGION}
      >
        {location && (
          <Marker coordinate={location} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ backgroundColor: online ? COLORS.primary : COLORS.textDim, padding: 8, borderRadius: 20, borderWidth: 3, borderColor: COLORS.white }}>
              <Ionicons name="navigate" size={16} color={COLORS.white} />
            </View>
          </Marker>
        )}
        {/* Shops of the deliveries offered to this driver */}
        {offers.map((r) => (
          <Marker
            key={r.id}
            coordinate={{ latitude: Number(r.pickup_lat), longitude: Number(r.pickup_lng) }}
            onPress={() => open(r.id)}
          >
            <View style={{ alignItems: 'center' }}>
              <View style={{ backgroundColor: COLORS.navy, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, marginBottom: 2 }}>
                <Text style={{ color: COLORS.white, fontSize: 11, fontWeight: '800' }}>TZS {Number(r.earning).toLocaleString()}</Text>
              </View>
              <View style={{ backgroundColor: COLORS.primary, padding: 6, borderRadius: 16, borderWidth: 2, borderColor: COLORS.white }}>
                <Ionicons name="storefront" size={14} color={COLORS.white} />
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Top bar */}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={{ backgroundColor: COLORS.white, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6 }}
          >
            <Ionicons name="menu" size={24} color={COLORS.textPrimary} />
          </Pressable>
          {approved && (
            <View style={{ backgroundColor: COLORS.white, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: online ? COLORS.success : COLORS.textDim }} />
              <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{online ? 'Online' : 'Offline'}</Text>
            </View>
          )}
          <Pressable
            onPress={locate}
            style={{ backgroundColor: COLORS.white, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6 }}
          >
            <Ionicons name="locate" size={22} color={COLORS.textPrimary} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Bottom panel */}
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {!!currentRide && (
            <Pressable
              onPress={() => openDelivery(currentRide.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.navy, borderRadius: 18, padding: 14, marginBottom: 10 }}
            >
              <Ionicons name="bicycle" size={22} color={COLORS.white} />
              <Text style={{ flex: 1, color: COLORS.white, fontWeight: '800' }}>Delivery in progress</Text>
              <Text style={{ color: COLORS.white, fontWeight: '700' }}>Open</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.white} />
            </Pressable>
          )}
          {approved ? (
            <ApprovedPanel
              online={online}
              toggling={toggling}
              onToggle={goLive}
              offers={offers}
              onOpen={open}
              earnings={profile}
            />
          ) : appState === 'rejected' ? (
            <RejectedPanel reason={application?.rejection_reason} onReapply={() => router.replace('/register')} />
          ) : (
            <ReviewPanel onCheck={refreshStatus} />
          )}
        </View>
      </SafeAreaView>

      {/* Incoming request modal */}
      {online && approved && !currentRide && (
        <RideRequestModal ride={incoming} onAccept={onAccept} onDecline={decline} onTimeout={dismiss} />
      )}
    </View>
  );
}

// ── "Application in review" panel (matches the screenshot) ────────────────────
function ReviewPanel({ onCheck }: { onCheck: () => void }) {
  return (
    <View style={{ backgroundColor: COLORS.white, borderRadius: 18, padding: 18, elevation: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.warningBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="hourglass-outline" size={26} color={COLORS.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: COLORS.textPrimary }}>Application in review</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
            Your driver account is under review. We'll notify you by app, email and SMS once approved.
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onCheck}
        style={{ marginTop: 14, borderRadius: 24, borderWidth: 1.5, borderColor: COLORS.border, paddingVertical: 12, alignItems: 'center' }}
      >
        <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>Check status</Text>
      </Pressable>
    </View>
  );
}

function RejectedPanel({ reason, onReapply }: { reason?: string; onReapply: () => void }) {
  return (
    <View style={{ backgroundColor: COLORS.white, borderRadius: 18, padding: 18, elevation: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close-circle-outline" size={26} color={COLORS.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: COLORS.textPrimary }}>Application not approved</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
            {reason || 'Please review your documents and re-apply.'}
          </Text>
        </View>
      </View>
      <Pressable onPress={onReapply} style={{ marginTop: 14, borderRadius: 24, backgroundColor: COLORS.primary, paddingVertical: 13, alignItems: 'center' }}>
        <Text style={{ fontWeight: '800', color: COLORS.white }}>Update & re-apply</Text>
      </Pressable>
    </View>
  );
}

// ── GO LIVE panel (approved drivers) ──────────────────────────────────────────
function ApprovedPanel({
  online,
  toggling,
  onToggle,
  offers,
  onOpen,
  earnings,
}: {
  online: boolean;
  toggling: boolean;
  onToggle: () => void;
  offers: RideOffer[];
  onOpen: (rideId: string) => void;
  earnings: any;
}) {
  return (
    <View style={{ backgroundColor: COLORS.white, borderRadius: 22, padding: 18, elevation: 8, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 12 }}>
      {online && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
          <Stat label="Today balance" value={`TZS ${Number(earnings?.balance || 0).toLocaleString()}`} />
          <Stat label="Trips" value={String(earnings?.total_trips ?? 0)} />
          <Stat label="Requests" value={String(offers.length)} />
        </View>
      )}

      {/* Offers near you, nearest shop first */}
      {online && offers.length > 0 && (
        <View style={{ marginBottom: 14, gap: 8 }}>
          {offers.slice(0, 3).map((r) => (
            <Pressable
              key={r.id}
              onPress={() => onOpen(r.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12 }}
            >
              <Ionicons name="storefront" size={18} color={COLORS.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: COLORS.textPrimary }} numberOfLines={1}>
                  {r.shop_name || r.pickup_address || 'Pickup'}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  {r.pickup_distance_km != null ? `${r.pickup_distance_km} km away · ` : ''}trip {Number(r.trip_km || r.distance_km).toFixed(1)} km
                </Text>
              </View>
              <Text style={{ fontWeight: '800', color: COLORS.success }}>TZS {Number(r.earning).toLocaleString()}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        onPress={onToggle}
        disabled={toggling}
        style={{
          backgroundColor: online ? COLORS.danger : COLORS.primary,
          borderRadius: 30,
          paddingVertical: 18,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        {toggling ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <>
            <Ionicons name={online ? 'stop-circle' : 'play-circle'} size={24} color={COLORS.white} />
            <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 18 }}>
              {online ? 'GO OFFLINE' : 'GO LIVE'}
            </Text>
          </>
        )}
      </Pressable>
      {!online && (
        <Text style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: 12, marginTop: 10 }}>
          {BRAND.slogan} · Go live to receive delivery requests near you
        </Text>
      )}
      {online && offers.length === 0 && (
        <Text style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: 12, marginTop: 10 }}>
          You'll get deliveries from shops near you first. Keep the app open or in the background.
        </Text>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontWeight: '800', fontSize: 15, color: COLORS.textPrimary }}>{value}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
